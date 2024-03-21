import fs from "node:fs";

const process = Deno;

// --------------------------------------------------------------------
// ------------------------------ CONFIGURATION -----------------------
// --------------------------------------------------------------------

const config = {
  bkp: {
    drive: { serial: 'ZA465ASK', mountPath: '/media/D' },
    repo: {
      webUrl: 'https://github.com/anasouardini/dotfiles.git',
      sshUrl: 'git@github.com:anasouardini/dotfiles.git'
    },
    dotfiles: {
      path: '$HOME/.dotfiles'
    }
  },
  dryRun: false,
  user: {
    name: 'venego'
  },
  path: {
    log: "postInstallation.log",
  },
  defaults: {
    template: "desktop",
  },
};

// --------------------------------------------------------------------
// ---------------------------- UTILITIES -----------------------------
// --------------------------------------------------------------------

interface Print {
  title: (msg: string) => void,
  error: (msg: string) => void,
  success: (msg: string) => void,
  info: (msg: string) => void,
}
const print: Print = {
  title: (msg: string) => {
    console.log(`\x1b[33m${msg}\x1b[0m`);
  },
  error: (msg: string) => {
    console.log(`\x1b[31m${msg}\x1b[0m`);
  },
  success: (msg: string) => {
    console.log(`\x1b[32m${msg}\x1b[0m`);
  },
  info: (msg: string) => {
    console.log(`\x1b[34m${msg}\x1b[0m`);
  },
};

const logVars = {
  logSessionMarked: false,
};
const log = ({
  orderStr,
  title,
  msg,
  printToConsole = true,
}: {
  orderStr: string;
  title: string;
  msg: string;
  printToConsole?: true;
}) => {
  // mark beginning of an installation
  if (!logVars.logSessionMarked) {
    fs.appendFileSync(
      config.path.log,
      `\n-----------------------------------------------------------------------------------------------
       \n------------------->> ${new Date().toISOString()} - installation start <<----------------------\n
        ------------------------------------------------------------------------------------------------\n`
    );
    logVars.logSessionMarked = true;
  }

  if (printToConsole) {
    print.error(msg);
  }
  fs.appendFileSync(
    config.path.log,
    `\n------------------->> ${new Date().toISOString()} - ${orderStr}\n${title}\n${msg}\n<<----------------------\n`
  );
};

const sleep = (t: number) => new Promise((resolve) => setTimeout(resolve, t));

const command = (cmd: string, printOutput: boolean = false) => {
  const output = new process.Command("bash", { args: ["-c", cmd] }).outputSync();

  const decoder = new TextDecoder();
  const stderr = decoder.decode(output.stderr);
  const stdout = decoder.decode(output.stdout);

  if (printOutput) {
    console.log("stdout:", stdout);
  }

  if (stderr) {
    //* some warnings are outputed as errors.
    const falsePositives = ["warning"];
    if (
      falsePositives.some((item) =>
        stderr.toLowerCase().includes(item.toLocaleLowerCase())
      )
    ) {
      console.log("IMPORTANT (I guess) => " + stderr);
      return;
    }

    throw Error(stderr);
  }
};

interface EnvVars {
  driveAttached: boolean,
  driveMounted: boolean,
  internetAvailable: boolean,
}
const envVars: EnvVars = {
  driveAttached: true,
  driveMounted: true,
  internetAvailable: true,
}
const checkEnv = () => {
  try {
    command(`
      BKP_DRIVE_ATTACHED=$(lsblk -o name,serial \\
      | grep "${config.bkp.drive.serial}" \\
      | awk '{print $2}'); \\
      if [[ ! $BKP_DRIVE_ATTACHED == "${config.bkp.drive.serial}" ]]; then \\
        echo "err" >&2; \\
      fi
    `);
  } catch (err) {
    envVars.driveAttached = false;
  }

  try {
    command(`
      OUTPUT=$(lsblk -o mountpoints,name,serial); \\
      DRIVE_NAME=$(printf "$OUTPUT" \\
        | grep "${config.bkp.drive.serial}" \\
        | awk '{print $1}'); \\
      BKP_DRIVE_MOUNT=$(printf "$OUTPUT" \\
        | grep "└─"$DRIVE_NAME \\
        | awk '{print $1}'); \\
      if [[ ! $BKP_DRIVE_MOUNT == "${config.bkp.drive.mountPath}" ]]; then \\
        echo "err" >&2; \\
      fi
    `);
  } catch (err) {
    envVars.driveMounted = false;
  }

  try {
    command(`
      ping -c 1 1.1.1.1; \\
      if [[ ! $? == 0 ]]; then \\
        echo "err" >&2; \\
      fi
    `);
  } catch (err) {
    envVars.internetAvailable = false;
  }

  return {
    allSet: Object.values(envVars).every((val) => val == true),
    env: envVars
  }
};

const loadEnv = () => {
  print.info("checking environment...");
  if (!checkEnv().allSet) {
    if (envVars.driveAttached && !envVars.driveMounted) {
      try {
        command(`
          OUTPUT=$(lsblk -o mountpoints,name,serial); \\
          DRIVE_NAME=$(printf "$OUTPUT" \\
            | grep "${config.bkp.drive.serial}" \\
            | awk '{print $1}'); \\
          BKP_DRIVE_MOUNT=$(printf "$OUTPUT" \\
            | grep "└─"$DRIVE_NAME \\
            | awk '{print $1}'); \\
          if [[ ! $BKP_DRIVE_MOUNT == "${config.bkp.drive.mountPath}" ]]; then \\
            sudo mount "/dev/"$DRIVE_NAME"1" "${config.bkp.drive.mountPath}"; \\
          fi; \\
          if [[ ! $? == 0 ]]; then \\
            echo "err" >&2; \\
          fi
        `);
        envVars.driveMounted = true;
      } catch (err) {
        console.log(err)
      }
    }
  }

  const env = checkEnv();
  if (!env.allSet) {
    return env;
  }

  return env;
}

// ------------------------------------------------------------------
// ----------------------------- STEPS ------------------------------
// ------------------------------------------------------------------

type Steps = {
  enabled?: boolean;
  category: "common" | "homeServer" | "desktop" | "termux";
  title: string;
  substeps: {
    enabled?: boolean;
    title?: string;
    cmd?: string[];
    apps?: string[];
  }[];
};
const steps: Steps[] = [
  {
    category: "common",
    title: "Updating sources and packages",
    substeps: [
      {
        title: "updating and upgrading",
        cmd: ["sudo apt update -y"],
      },
    ],
  },
  {
    category: "common",
    title: "installing apt config dependencies",
    substeps: [
      {
        apps: ["rsync"],
      },
    ],
  },
  {
    category: "common",
    title: "restore config",
    substeps: [
      {
        title: "restore apt config",
        cmd: [
          `rsync -avh ${config.bkp.drive.mountPath}/bkp/bkpos/etc/apt /etc/`,
        ]
      },
      {
        title: "restore keyrings for apt",
        cmd: [
          `rsync -avh ${config.bkp.drive.mountPath}/bkp/bkpos/usr/share/keyrings /usr/share/`,
          `rsync -avh ${config.bkp.drive.mountPath}/bkp/bkpos/home/${config.user.name}/.local/share/keyrings $HOME/.local/share/`,
        ]
      },
      {
        title: "updating repositories",
        cmd: ["sudo apt update -y;"],
      },
    ],
  },
  {
    category: "common",
    title: "mouse/kb setup",
    substeps: [
      {
        title: "copy mouse/keyboard config over",
        cmd: [
          `rsync -avh ${config.bkp.drive.mountPath}/bkp/bkpos/etc/X11/xorg.conf.d /etc/X11/`
        ]
      }
    ],
  },
  {
    category: "common",
    title: "Wrapper for apt, a better way of installing packages.",
    substeps: [
      {
        apps: ["nala"],
      },
    ],
  },
  {
    enabled: false,
    category: "common",
    title: "bluetooth setup",
    substeps: [
      /////////////////////////////////// bluetooth
      //// these might be needed
      // bluetooth gnome-bluetooth bluez bluez-tools pulseaudio-module-bluetooth
      // blueman

      //// these are the apparently required packages
      // bluez bluez-tools pulseaudio-module-bluetooth pipewire pipewire-pulse

      //// this fixes a very annoying bug
      // systemctl --user --now enable pipewire pipewire-pulse

      {
        apps: [
          "bluez",
          "bluez-tools",
          "pulseaudio-module-bluetooth",
          "pipewire",
          "pipewire-pulse",
        ],
      },
    ],
  },
  {
    category: "common",
    title: "net stuff",
    substeps: [
      {
        apps: [
          "network-manager",
          // "wondershaper",
          "wget",
          "curl",
          "arp-scan",
          "sshfs",
        ],
      },
      {
        enabled: false,
        apps: [
          "netplan.io",
          // "dsniff",
          "proftpd",
          "hping3",
          // "speedtest-cli",
          // "macchanger", // can't install unattendenly
        ],
      },
    ],
  },
  {
    enabled: false,
    category: "common",
    title: "tools for building source files",
    substeps: [
      {
        apps: ["build-essential", "libx11-dev", "gcc", "make", "cmake"],
      },
    ],
  },
  {
    category: "desktop",
    title: "X11 related stuff",
    substeps: [
      {
        apps: [
          "xorg",
          "xinput",
          "arandr",
          "xdo",
          "xdotool",
          "xclip",
          "xbanish",
        ],
      },
    ],
  },
  {
    category: "common",
    title: "VCS",
    substeps: [
      {
        apps: ["git"],
      },
    ],
  },
  {
    category: "desktop",
    title: "multimedia tools",
    substeps: [
      {
        apps: [
          "vlc",
          "yt-dlp",
          "flameshot",
          "simplescreenrecorder",
          "zathura",
          "zathura-pdf-poppler",
          // "obs-studio",
          // "cheese",
          "mpd",
          "ncmpcpp",
          "mpc",
          "sxiv",
          "gimp",
          // "imagemagick",
          // "xloadimage",
          // "feh",
        ],
      },
      {
        enabled: false,
        title: "installing droidCam",
        cmd: [
          `mkdir -p $HOME/Downloads/droidCam && cd $HOME/Downloads/droidCam \\
          wget -O droidcam_latest.zip https://files.dev47apps.net/linux/droidcam_2.0.0.zip \\
          unzip droidcam_latest.zip \\
          sudo ./install-client \\
          sudo apt install linux-headers-\`uname -r\` gcc make \\
          sudo ./install-video`,
        ],
      },
    ],
  },
  {
    category: "common",
    title: "better alternatives",
    substeps: [
      {
        apps: ["ripgrep", "btop", "fd-find", "ncdu", "bat", "tldr"],
      },
    ],
  },
  {
    category: "common",
    title: "basic tools",
    substeps: [
      {
        apps: ["rsync", "bc", "tree", "trash-cli", "rename", "whois", "fzf"],
      },
    ],
  },
  {
    category: "common",
    title: "disk tools",
    substeps: [
      {
        title: "partitioning, resizing, etc",
        apps: ["dosfstools", "gdisk", "lvm2", "smartmontools"],
      },
      {
        enabled: false,
        title: "backup",
        apps: ["timeshift"],
      },
    ],
  },
  {
    enabled: false,
    category: "common",
    title: "android tools",
    substeps: [
      {
        apps: ["adb", "fastboot"],
      },
    ],
  },
  {
    enabled: false,
    category: "desktop",
    title: "virtualization",
    substeps: [
      {
        title: "Docker",
        apps: ["docker.io", "docker-compose"],
      },
      {
        title: "qemu shared dependencies",
        apps: ["qemu-system", "libvirt-daemon-system"],
      },
      {
        enabled: false, // enable when using CLI-only
        title: "qemu CLI dependencies - enable if you disable GUI client",
        apps: ["libvirt-clients", "qemu-utils", "ovmf"],
      },
      {
        title: "CLI client",
        apps: ["virtinst"],
      },
      {
        title: "GUI client",
        apps: ["virt-manager"],
      },
      {
        title: "qemu viewer",
        apps: ["virt-viewer"],
      },
      {
        title: "adding user to libvirt groups",
        cmd: [`sudo usermod -aG libvirt,libvirt-qemu $USER`],
      },
      {
        title: "adding user to docker group",
        cmd: [`sudo usermod -aG docker $USER`],
      },
    ],
  },
  {
    category: "common",
    title: "security",
    substeps: [
      {
        enabled: false,
        apps: ["firejail", "ufw"],
      },
      {
        enabled: false,
        apps: ["tor", "proxychains"],
      },
      {
        apps: ["pass", "pinentry-qt"],
        // TODO: make this more generic: get gpg key id by email
        cmd: ["pass init 29E7111E31B67AD036E371BC2DC6D6ACC9718E3E"],
      },
      {
        title: "a password prompt for privs escalation (for GUI apps)",
        apps: ["policykit-1-gnome"],
      },
    ],
  },
  {
    category: "desktop",
    title: "notifications",
    substeps: [
      {
        apps: ["dbus-x11", "notification-daemon", "libnotify-bin", "dunst"],
      },
    ],
  },
  {
    category: "desktop",
    title: "audio tools",
    substeps: [
      {
        apps: ["pulseaudio", "alsa-utils", "pavucontrol"],
      },
    ],
  },
  {
    category: "desktop",
    title: "desktop GUI",
    substeps: [
      {
        title: "wm and status bar",
        apps: ["i3", "polybar"],
      },
      {
        title: "app luncher and menu",
        apps: ["suckless-tools" /*'rofi'*/],
      },
      {
        title: "hot key daemon",
        apps: ["sxhkd"],
      },
      {
        title: "installing keyboard key mapper (keyd)",
        cmd: [
          `mkdir -p $HOME/Downloads; cd $HOME/Downloads \\
          git clone https://github.com/rvaiya/keyd \\
          sudo apt install gcc make -y \\
          cd keyd \\
          make && sudo make install \\
          sudo systemctl enable keyd && sudo systemctl start keyd`,
        ],
      },
    ],
  },
  {
    category: "desktop",
    title: "file management",
    substeps: [
      {
        apps: ["ranger"],
      },
    ],
  },
  {
    category: "desktop",
    title: "terminal",
    substeps: [
      {
        apps: ["alacritty"],
      },
    ],
  },
  {
    category: "desktop",
    title: "browsers",
    substeps: [
      {
        apps: ["chromium", "brave-browser", "google-chrome-stable"],
      },
    ],
  },
  {
    enabled: false,
    category: "desktop",
    title: "mail client",
    substeps: [
      {
        apps: ["thunderbird"],
      },
    ],
  },
  {
    enabled: false,
    category: "desktop",
    title: "torrent client - deb package",
    substeps: [
      {
        cmd: [
          "mkdir -p $HOME/Downloads;",
          "wget -O $HOME/Downloads/libssl.deb http://snapshot.debian.org/archive/debian/20110406T213352Z/pool/main/o/openssl098/libssl0.9.8_0.9.8o-7_i386.deb",
          "sudo apt install $HOME/Downloads/libssl.deb -y",
          "rm $HOME/Downloads/libssl.deb",
          "sudo wget -O /usr/src/utorrent.tar.gz http://download.utorrent.com/linux/utorrent-server-3.0-25053.tar.gz",

          `cd /usr/src \\
          sudo tar xvzf /usr/src/utorrent.tar.gz -C utorrent/ \\
          sudo mv torrent-server* torrent \\
          sudo ln -s /usr/src/utorrent/utserver /usr/bin/utserver`,
        ],
      },
    ],
  },
  {
    category: "common",
    title: "databases",
    substeps: [
      {
        enabled: false,
        title: "installing MySQL",
        apps: ['myql']
      },
      {
        title: "installing sqlite3",
        apps: ["sqlite3"],
      },
    ],
  },
  {
    category: "common",
    title: "editors",
    substeps: [
      {
        title: "installing lazyvim from repo",
        enabled: false,
        apps: ["lazyvim (nvm)"],
        cmd: [
          "git clone https://github.com/LazyVim/starter $HOME/.config/nvim",
          "rm -rf $HOME/.config/nvim/.git",
          "sudo apt update -y",
        ],
      },
      {
        title: "installing vscode",
        apps: ['code']
      },
    ],
  },
  {
    enabled: false,
    category: "homeServer",
    title: "jellyFin server",
    substeps: [
      {
        cmd: [
          "wget -O- https://repo.jellyfin.org/install-debuntu.sh | sudo bash",
        ],
      },
    ],
  },
  {
    enabled: false,
    category: "homeServer",
    title: "plex server",
    substeps: [
      {
        cmd: [
          "echo deb https://downloads.plex.tv/repo/deb public main | sudo tee /etc/apt/sources.list.d/plexmediaserver.list",
          "curl https://downloads.plex.tv/plex-keys/PlexSign.key | sudo apt-key add -",
          "sudo apt update -y",
        ],
      },
      {
        apps: ["plexmediaserver"],
      },
    ],
  },
  {
    category: "common",
    title: "change default shell to zsh and installing zap (package manager)",
    substeps: [
      {
        apps: ["zsh", "zsh-autosuggestions", "zsh-syntax-highlighting"],
      },
      {
        cmd: [
          "sudo chsh -s /bin/zsh $USER",
          "zsh <(curl -s https://raw.githubusercontent.com/zap-zsh/zap/master/install.zsh) --branch release-v1",
        ],
      },
    ],
  },
  {
    enabled: false,
    category: "common",
    title: "installing nvm and node",
    substeps: [
      {
        cmd: [
          `
            curl https://raw.githubusercontent.com/creationix/nvm/master/install.sh | bash; \\
            export NVM_DIR="$HOME/.nvm"; \\
            [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"; \\
            [ -s "$NVM_DIR/bash_completion" ] && . "$NVM_DIR/bash_completion"; \\
            nvm install node; \\
            npm i -g pnpm && pnpm --force setup && source $HOME/.zshrc && pnpm i -g pnpm;
          `,
        ],
      },
    ],
  },
  {
    enabled: false,
    category: "desktop",
    title: "installing node packages",
    substeps: [
      {
        cmd: ["pnpm i -g nodemon pm2 prettier typescript"],
      },
    ],
  },
  {
    title: "remove useless dirs",
    category: "common",
    substeps: [
      {
        cmd: [
          `rm -rf Public Videos Templates Pictures Music Documents Desktop`,
        ],
      },
    ],
  },
  {
    title: "set time zone",
    category: "common",
    substeps: [
      {
        cmd: [`sudo timedatectl set-timezone Africa/Casablanca`],
      },
    ],
  },
  {
    // TODO: syncing home files from home server
    enabled: false,
    title: "syncing home files from home server",
    category: "desktop",
    substeps: [
      {
        cmd: [],
      },
    ],
  },
  {
    category: "common",
    title: "setting up dotfiles",
    substeps: [
      {
        title: "backing up any old .dotfiles",
        cmd: [`[ -d ${config.bkp.dotfiles.path} ] && mv ${config.bkp.dotfiles.path} ${config.bkp.dotfiles.path}-bkp`],
      },
      {
        title: "cloning the dotfiles repo",
        cmd: [
          `git clone --bare ${config.bkp.repo.sshUrl} ${config.bkp.dotfiles.path}`,
        ],
      },
      {
        title: "adding both homeServer and github remotes",
        cmd: [
          `git --git-dir=${config.bkp.dotfiles.path} --work-tree=$HOME remote add origin ${config.bkp.repo.sshUrl}`,
        ],
      },
      {
        title: `checkout ${config.bkp.dotfiles.path} after backing up existing dotfiles`,
        cmd: [
          `git --git-dir=${config.bkp.dotfiles.path} --work-tree=$HOME checkout \\
          if [[ $? -eq 0 ]]; then \\
            echo "Checked out config successfully." \\
          else \\
            echo "Backing up pre-existing dot files, to not ovverride them." \\
            mkdir -p .dotfiles-backup \\
            git --git-dir=${config.bkp.dotfiles.path} --work-tree=$HOME checkout 2>&1 | egrep "\s+\." | awk {'print $1'} | xargs -I{} mv {} .dotfiles-backup/{} \\
            # git-checkout dotfiles for the repo \\
            git --git-dir=${config.bkp.dotfiles.path} --work-tree=$HOME checkout -f \\
            echo "Checked out config successfully." \\
          fi`,
        ],
      },
      {
        title: "hiding untracked files",
        cmd: [
          `git --git-dir=${config.bkp.dotfiles.path} --work-tree=$HOME config --local status.showUntrackedFiles no`,
        ],
      },
    ],
  },
];

// TODO: disable password for reboot and shutdown
//     'add the following to /etc/sudoers:',
//     '%venego ALL=(ALL:ALL) NOPASSWD: /sbin/reboot, /sbin/shutdown, /sbin/poweroff, /usr/bin/chvt'

const manualSteps = [
  "re-login for the default shell to be set",
  "add core2 (home server) to /etc/hosts",
  "edit grub (reduce tiemout)",
];

// --------------------------------------------------------------------
// ------------------------- INSTALLATION RUN -------------------------
// --------------------------------------------------------------------

function validateSteps() {
  // steps.
}

async function runSteps() {
  const stepsList = steps;
  for (let stepIndex = 0; stepIndex < stepsList.length; stepIndex++) {
    const step = stepsList[stepIndex];

    if (
      step.category !== config.defaults.template &&
      step.category !== "common"
    ) {
      continue;
    }
    if (step.enabled === false) {
      continue;
    }

    console.log(""); //* don't remove
    print.title(
      `================ ${stepIndex + 1} / ${stepsList.length} - ${step.category
      } - ${step.title ? step.title : "untitled step"} =====================`
    );
    // print[step.enabled === false ? 'info': 'title']('==================================================================')

    const substepsList = step.substeps;
    for (
      let substepIndex = 0;
      substepIndex < substepsList.length;
      substepIndex++
    ) {
      const substep = substepsList[substepIndex];

      if (substep.enabled === false) {
        continue;
      }

      print.title(
        `${substepIndex + 1} / ${substepsList.length} - ${substep.title ?? "untitled substep"
        }`
      );

      if (substep.apps) {
        for (let appIndex = 0; appIndex < substep.apps.length; appIndex++) {
          const appsList = substep.apps;
          const app = substep.apps[appIndex];

          print.title(`${appIndex + 1} / ${appsList.length} - [app] ${app}`);
          if (!config.dryRun) {
            try {
              command(`sudo apt install ${app} -y`);
            } catch (err) {
              log({
                orderStr: `${appIndex + 1} / ${appsList.length}`,
                title: `[app] ${app}`,
                msg: `${err}`,
              });
            }
          }
        }
        continue;
      }

      const cmdList = substep.cmd;
      if (!config.dryRun && Array.isArray(cmdList)) {
        for (let cmdIndex = 0; cmdIndex < cmdList.length; cmdIndex++) {
          const cmd = cmdList[cmdIndex];

          try {
            print.title(
              `${cmdIndex + 1} / ${cmdList.length} - [cmd] "${cmd.slice(
                0,
                21
              )}..."`
            );
            command(cmd);
          } catch (err) {
            log({
              orderStr: `${stepIndex + 1}.${substepIndex + 1}.${cmdIndex + 1}/${stepsList.length
                }.${substepsList.length}.${cmdList.length}`,
              title: `running ${cmd}`,
              msg: `${err}`,
            });
          }
        }
      }
    }
  }

  console.log();
  print.title("======== Manual Steps ===========");
  manualSteps.forEach((step, index) => {
    if (typeof step == "string") {
      print.title(`${index + 1}) ${step}`);
      return;
    }

    //? maybe I'll add an array as a list of substeps
    // step.forEach();
  });
}

// ---------------------------------------------------------------
// ------------------------- HANDLE ARGS -------------------------
// ---------------------------------------------------------------

const args = {
  length: process.args.length,
  // option: process.args[1], // in nodejs
  option: process.args[0] as string, // in deno
  //? args should be like "node thing.js option argKey:argValue"
  optionArgs: process.args
    .slice(1)
    .reduce((accumulator: {}, optionArg: string) => {
      const optionArgTupal = optionArg.split(":");
      accumulator = { ...accumulator, [optionArgTupal[0]]: optionArgTupal[1] };
      return accumulator;
    }, {}),
};

const main = async () => {
  if (args.length) {
    const options: { [key: string]: (args: any) => any } = {
      // list steps
      list: ({ includeDisabled }: { includeDisabled: string }) => {
        // console.log({ includeDisabled: Boolean(includeDisabled) })
        let stepsList = steps;
        if (!Number(includeDisabled)) {
          stepsList = steps.filter((step) => step.enabled !== false);
        }
        stepsList.forEach((step, stepIndex, list) => {
          print[step.enabled === false ? "error" : "title"](
            `${stepIndex + 1} / ${list.length} - ${step.category} - ${step.title
            }`
          );
        });
      },
      // TODO: add other options
    };

    if (options?.[args.option]) {
      // console.log(args.optionArgs)
      options[args.option](args.optionArgs);
    } else {
      // the default action: when no arguments were passed

      if (args.option != 'no-check') {
        print.info("setting up environment...");
        const env = loadEnv();
        console.log(env);
        if (!env.allSet) {
          print.error(`The environment wasn't setup`)
          process.exit(1);
        }
      }

      await runSteps();
    }
  }
};

// ----------------- ENTRY POINT
await main();

// -----------------------------------------------
// --------------------- TODO --------------------
// -----------------------------------------------

// feat
// TODO: specify whether a step is a dependency for another; don't run the step which its depenency was not successful.

// UX
// TODO: add undo function for each step.
// TODO: interactive configuration

// DEBUGGING
// TODO: option to go through each step and prompt for "yes/no"
// TODO: option to run a step/sub-step by it's order
// TODO: fix mode — go over the unsuccessful steps
// TODO: dry-run should tell you if you already have the app installed, configuration done, or file doesn't exist.
// TODO: dry-run should tell you if the command or app is invalid; use the built-in dry-run of apps like rsync
