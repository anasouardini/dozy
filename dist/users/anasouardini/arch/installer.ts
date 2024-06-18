import fs from 'node:fs';

const process = Deno;

// --------------------------------------------------------------------
// ------------------------------ CONFIGURATION -----------------------
// --------------------------------------------------------------------

const config = {
  bkp: {
    drive: { serial: 'ZA465ASK', mountPath: '/media/D' },
    repo: {
      webUrl: 'https://github.com/anasouardini/dotfiles.git',
      sshUrl: 'git@github.com:anasouardini/dotfiles.git',
      localURI: '',
    },
    dotfiles: {
      path: '$HOME/.dotfiles',
    },
  },
  dryRun: false,
  path: {
    log: 'postInstallation.log',
  },
  defaults: {
    template: 'desktop',
  },
  installCommandPrefix: "sudo pacman -S --noconfirm"
};
config.bkp.repo.localURI = `${config.bkp.drive.mountPath}/bkp/bkpRepos/.dotfiles.git`;

// --------------------------------------------------------------------
// ---------------------------- UTILITIES -----------------------------
// --------------------------------------------------------------------

interface Print {
  title: (msg: string) => void;
  error: (msg: string) => void;
  success: (msg: string) => void;
  info: (msg: string) => void;
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
        ------------------------------------------------------------------------------------------------\n`,
    );
    logVars.logSessionMarked = true;
  }

  if (printToConsole) {
    print.error(msg);
  }
  fs.appendFileSync(
    config.path.log,
    `\n------------------->> ${new Date().toISOString()} - ${orderStr}\n${title}\n${msg}\n<<----------------------\n`,
  );
};

const sleep = (t: number) => new Promise((resolve) => setTimeout(resolve, t));

const command = (cmd: string, printOutput: boolean = false) => {
  const output = new process.Command('bash', {
    args: ['-c', cmd],
  }).outputSync();

  const decoder = new TextDecoder();
  const stderr = decoder.decode(output.stderr);
  const stdout = decoder.decode(output.stdout);

  if (printOutput) {
    console.log('stdout:', stdout);
  }

  if (stderr) {
    //* some warnings are outputed as errors.
    const falsePositives = ['warning'];
    if (
      falsePositives.some((item) =>
        stderr.toLowerCase().includes(item.toLocaleLowerCase()),
      )
    ) {
      console.log('IMPORTANT (I guess) => ' + stderr);
      return;
    }

    throw Error(stderr);
  }
};

interface EnvVars {
  driveAttached: boolean;
  driveMounted: boolean;
  internetAvailable: boolean;
}
const envVars: EnvVars = {
  driveAttached: true,
  driveMounted: true,
  internetAvailable: true,
};
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
    env: envVars,
  };
};

const loadEnv = () => {
  print.info('checking environment...');
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
        console.log(err);
      }
    }
  }

  const env = checkEnv();
  if (!env.allSet) {
    return env;
  }

  return env;
};

// ------------------------------------------------------------------
// ----------------------------- STEPS ------------------------------
// ------------------------------------------------------------------

type Steps = {
  enabled?: boolean;
  category: 'common' | 'homeServer' | 'desktop' | 'termux';
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
    category: 'common',
    title: 'Updating sources and packages',
    substeps: [
      {
        title: 'updating',
        cmd: ['sudo pacman -Syyu --noconfirm'],
      },
    ],
  },
  {
    category: 'common',
    title: 'rsync is needed to restore configs',
    substeps: [
      {
        apps: ['rsync'],
      },
    ]
  },
  {
    category: 'common',
    title: 'mouse/kb setup',
    substeps: [
      {
        title: 'copy mouse/keyboard config over',
        cmd: [
          `sudo rsync -avh ${config.bkp.drive.mountPath}/bkp/bkpos/etc/X11/xorg.conf.d /etc/X11/`,
        ],
      },
    ],
  },
  {
    category: 'common',
    title: 'aur package manager',
    substeps: [
      {
        apps: ['yay'],
      },
    ],
  },
  {
    enabled: false,
    category: 'common',
    title: 'bluetooth setup',
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
          'bluez',
          'bluez-tools',
          'pulseaudio-bluetooth',
          'pipewire',
          'pipewire-pulse',
        ],
      },
    ],
  },
  {
    category: 'common',
    title: 'net stuff',
    substeps: [
      {
        apps: [
          'network-manager',
          // "wondershaper",
          'wget',
          'curl',
          'arp-scan',
          'sshfs',
        ],
      },
      {
        enabled: false,
        apps: [
          'netplan',
          // "dsniff",
          'proftpd',
          'hping',
          // "speedtest-cli",
          // "macchanger", // can't install unattendenly
        ],
      },
    ],
  },
  {
    enabled: false,
    category: 'common',
    title: 'tools for building source files',
    substeps: [
      {
        apps: ['base-devel', 'libx11', 'gcc', 'make', 'cmake'],
      },
    ],
  },
  {
    category: 'desktop',
    title: 'X11 related stuff',
    substeps: [
      {
        apps: [
          'xorg',
          'xorg-xinit',
          'xinput',
          'arandr',
          'xdo',
          'xdotool',
          'xclip',
          'xbanish',
        ],
      },
    ],
  },
  {
    category: 'common',
    title: 'VCS',
    substeps: [
      {
        apps: ['git'],
      },
      {
        title: 'installing lazygit',
        cmd: [
          `
            mkdir -p $HOME/Downloads; cd $HOME/Downloads; \\
            LAZYGIT_VERSION=$(curl -s "https://api.github.com/repos/jesseduffield/lazygit/releases/latest" | grep -Po '"tag_name": "v\K[^"]*'); \\
            curl -Lo lazygit.tar.gz "https://github.com/jesseduffield/lazygit/releases/latest/download/lazygit_\${LAZYGIT_VERSION}_Linux_x86_64.tar.gz"; \\
            tar xf lazygit.tar.gz lazygit; \\
            sudo install lazygit /usr/local/bin;
          `,
        ],
      },
    ],
  },
  {
    category: 'desktop',
    title: 'multimedia tools',
    substeps: [
      {
        apps: [
          'vlc',
          'yt-dlp',
          'flameshot',
          'simplescreenrecorder',
          'zathura',
          'zathura-pdf-poppler',
          // "obs-studio",
          // "cheese",
          'mpd',
          'ncmpcpp',
          'mpc',
          'sxiv',
          'gimp',
          // "imagemagick",
          // "xloadimage",
          // "feh",
        ],
      },
      {
        enabled: false,
        title: 'installing droidCam',
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
    category: 'common',
    title: 'better alternatives',
    substeps: [
      {
        apps: ['ripgrep', 'btop', 'fd', 'ncdu', 'bat', 'tldr'],
      },
    ],
  },
  {
    category: 'common',
    title: 'basic tools',
    substeps: [
      {
        apps: ['rsync', 'bc', 'tree', 'trash-cli', 'rename', 'whois', 'fzf'],
      },
    ],
  },
  {
    category: 'common',
    title: 'disk tools',
    substeps: [
      {
        title: 'partitioning, resizing, etc',
        apps: ['dosfstools', 'sgdisk', 'lvm2', 'smartmontools'],
      },
      {
        enabled: false,
        title: 'backup',
        apps: ['timeshift'],
      },
    ],
  },
  {
    enabled: false,
    category: 'common',
    title: 'android tools',
    substeps: [
      {
        apps: ['adb', 'android-tools'],
      },
    ],
  },
  {
    enabled: false,
    category: 'desktop',
    title: 'virtualization',
    substeps: [
      {
        title: 'Docker',
        apps: ['docker', 'docker-compose'],
      },
      {
        title: 'qemu packages',
        apps: ['qemu-system', 'qemu-full', 'virt-manager'],
      },
      {
        title: 'adding user to libvirt groups',
        cmd: [`sudo usermod -aG libvirt,libvirt-qemu $USER`],
      },
      {
        title: 'adding user to docker group',
        cmd: [`sudo usermod -aG docker $USER`],
      },
    ],
  },
  {
    category: 'common',
    title: 'security',
    substeps: [
      {
        enabled: false,
        apps: ['firejail', 'ufw'],
      },
      {
        enabled: false,
        apps: ['tor', 'proxychains'],
      },
      {
        apps: ['pass', 'pinentry'],
        // TODO: make this more generic: get gpg key id by email
        cmd: ['pass init 29E7111E31B67AD036E371BC2DC6D6ACC9718E3E'],
      },
      {
        title: 'a password prompt for privs escalation (for GUI apps)',
        apps: ['lxqt-policykit'],
        cmd: ['sudo echo "pintentry-program /usr/bin/lxqt-policykit-agent" > ~/.gnupg/gpg-agent.conf'],
      },
    ],
  },
  {
    category: 'desktop',
    title: 'notifications',
    substeps: [
      {
        apps: ['dbus-x11', 'notification-daemon', 'libnotify', 'dunst'],
      },
    ],
  },
  {
    category: 'desktop',
    title: 'audio tools',
    substeps: [
      {
        apps: ['pulseaudio', 'alsa-utils', 'pavucontrol'],
      },
    ],
  },
  {
    category: 'desktop',
    title: 'desktop GUI',
    substeps: [
      {
        title: 'wm and status bar',
        apps: ['i3', 'polybar'],
      },
      {
        title: 'app luncher and menu',
        apps: ['demnu'],
      },
      {
        title: 'hot key daemon',
        apps: ['sxhkd'],
      },
      {
        title: 'installing keyboard key mapper (keyd)',
        cmd: [
          `mkdir -p $HOME/Downloads; cd $HOME/Downloads; \\
          git clone https://github.com/rvaiya/keyd; \\
          sudo apt install gcc make -y; \\
          cd keyd; \\
          make && sudo make install; \\
          sudo systemctl enable keyd && sudo systemctl start keyd; \\
          sudo usermod -aG keyd $USER; \\
          sudo rsync -avh ${config.bkp.drive.mountPath}/bkp/bkpos/etc/keyd/default.conf /etc/keyd/;
          `,
        ],
      },
    ],
  },
  {
    category: 'desktop',
    title: 'file management',
    substeps: [
      {
        apps: ['ranger'],
      },
    ],
  },
  {
    category: 'desktop',
    title: 'terminal',
    substeps: [
      {
        apps: ['alacritty'],
      },
    ],
  },
  {
    category: 'desktop',
    title: 'browsers',
    substeps: [
      {
        apps: ['chromium', 'brave', 'google-chrome'],
      },
    ],
  },
  {
    enabled: false,
    category: 'desktop',
    title: 'mail client',
    substeps: [
      {
        apps: ['thunderbird'],
      },
    ],
  },
  {
    enabled: false,
    category: 'desktop',
    title: 'torrent client - deb package',
    substeps: [
      {
        cmd: [
          'mkdir -p $HOME/Downloads;',
          'wget -O $HOME/Downloads/libssl.deb http://snapshot.debian.org/archive/debian/20110406T213352Z/pool/main/o/openssl098/libssl0.9.8_0.9.8o-7_i386.deb',
          'sudo apt install $HOME/Downloads/libssl.deb -y',
          'rm $HOME/Downloads/libssl.deb',
          'sudo wget -O /usr/src/utorrent.tar.gz http://download.utorrent.com/linux/utorrent-server-3.0-25053.tar.gz',

          `cd /usr/src \\
          sudo tar xvzf /usr/src/utorrent.tar.gz -C utorrent/ \\
          sudo mv torrent-server* torrent \\
          sudo ln -s /usr/src/utorrent/utserver /usr/bin/utserver`,
        ],
      },
    ],
  },
  {
    category: 'common',
    title: 'databases',
    substeps: [
      {
        enabled: false,
        title: 'installing MySQL',
        apps: ['myql'],
      },
      {
        title: 'installing sqlite3',
        apps: ['sqlite3'],
      },
    ],
  },
  {
    category: 'common',
    title: 'editors',
    substeps: [
      {
        title: 'installing lazyvim from source',
        enabled: false,
        cmd: [
          'git clone https://github.com/LazyVim/starter $HOME/.config/nvim',
          'rm -rf $HOME/.config/nvim/.git',
          'sudo apt update -y',
        ],
      },
      {
        title: 'installing vscode',
        apps: ['code'],
      },
    ],
  },
  {
    enabled: false,
    category: 'homeServer',
    title: 'jellyFin server',
    substeps: [
      {
        cmd: [
          'wget -O- https://repo.jellyfin.org/install-debuntu.sh | sudo bash',
        ],
      },
    ],
  },
  {
    enabled: false,
    category: 'homeServer',
    title: 'plex server',
    substeps: [
      {
        cmd: [
          'echo deb https://downloads.plex.tv/repo/deb public main | sudo tee /etc/apt/sources.list.d/plexmediaserver.list',
          'curl https://downloads.plex.tv/plex-keys/PlexSign.key | sudo apt-key add -',
          'sudo apt update -y',
        ],
      },
      {
        apps: ['plex-media-server'],
      },
    ],
  },
  {
    category: 'common',
    title: 'change default shell to zsh and installing zap (package manager)',
    substeps: [
      {
        apps: ['zsh', 'zsh-autosuggestions', 'zsh-syntax-highlighting'],
      },
      {
        cmd: [
          'sudo chsh -s /bin/zsh $USER',
          'zsh <(curl -s https://raw.githubusercontent.com/zap-zsh/zap/master/install.zsh) --branch release-v1',
        ],
      },
    ],
  },
  {
    category: 'common',
    title: 'installing nvm and node',
    substeps: [
      {
        cmd: [
          `
            curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash; \\
            export NVM_DIR="$HOME/.nvm"; \\
            [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"; \\
            [ -s "$NVM_DIR/bash_completion" ] && . "$NVM_DIR/bash_completion"; \\
            nvm i node; \\
            nvm i 21; \\
            corepack enable; \\
            pnpm i -g pnpm;
          `,
        ],
      },
    ],
  },
  {
    enabled: false,
    category: 'desktop',
    title: 'installing node packages',
    substeps: [
      {
        cmd: ['pnpm i -g nodemon pm2 prettier typescript'],
      },
    ],
  },
  {
    title: 'set time zone',
    category: 'common',
    substeps: [
      {
        cmd: [`sudo timedatectl set-timezone Africa/Casablanca`],
      },
    ],
  },
  {
    title: 'syncing/restore files from bkp drive',
    category: 'desktop',
    substeps: [
      {
        cmd: [
          // `sudo rsync -avh ${config.bkp.drive.mountPath}/bkp/bkpos/home/$USER/home $HOME;`, // we don't need this in a temporary VM
          `sudo rsync -avh ${config.bkp.drive.mountPath}/bkp/bkpos/home/$USER/home/scripts $HOME/home/;`,
          `sudo rsync -avh ${config.bkp.drive.mountPath}/bkp/bkpos/home/$USER/.config $HOME/;`,
          `sudo rsync -avh ${config.bkp.drive.mountPath}/bkp/bkpos/home/$USER/.vscode $HOME/;`,
          `sudo rsync -avh ${config.bkp.drive.mountPath}/bkp/bkpos/home/$USER/.gnupg $HOME/;`,
          `sudo rsync -avh ${config.bkp.drive.mountPath}/bkp/bkpos/home/$USER/.password-store $HOME/;`,
          `sudo rsync -avh ${config.bkp.drive.mountPath}/bkp/bkpos/home/$USER/.ssh $HOME/`,
        ],
      },
    ],
  },
  {
    category: 'common',
    title: 'setting up dotfiles',
    substeps: [
      {
        title: 'restore ssh keys',
        cmd: [
          `sudo rsync -avh ${config.bkp.drive.mountPath}/bkp/bkpos/home/$USER/.ssh $HOME/`,
        ],
      },
      {
        title: 'backing up any old .dotfiles',
        cmd: [
          `[ -d ${config.bkp.dotfiles.path} ] && mv ${config.bkp.dotfiles.path} ${config.bkp.dotfiles.path}-bkp`,
        ],
      },
      {
        title: 'cloning the dotfiles repo',
        cmd: [
          `git clone --bare ${config.bkp.repo.localURI} ${config.bkp.dotfiles.path}`,
        ],
      },
      {
        title: `checkout ${config.bkp.dotfiles.path} after backing up existing dotfiles`,
        cmd: [
          `git --git-dir=${config.bkp.dotfiles.path} --work-tree=$HOME checkout -f;`,
        ],
      },
      {
        title: 'hiding untracked files',
        cmd: [
          `git --git-dir=${config.bkp.dotfiles.path} --work-tree=$HOME config --local status.showUntrackedFiles no`,
        ],
      },
    ],
  },
  {
    category: 'desktop',
    title: 'configuring permissions',
    substeps: [
      {
        cmd: [
          'echo "$USER ALL=(ALL:ALL) NOPASSWD: /sbin/reboot, /sbin/shutdown, /sbin/poweroff, /usr/bin/chvt" | sudo tee -a /etc/sudoers;'
        ],
      },
    ],
  }
];
// todo: install lazygit

const manualSteps = [
  're-login for the default shell to be set',
  'add core2 (home server) to /etc/hosts',
  'edit grub (reduce tiemout)',
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
    if (step.title == 'stopper') {
      process.exit(0);
    }

    if (
      step.category !== config.defaults.template &&
      step.category !== 'common'
    ) {
      continue;
    }
    if (step.enabled === false) {
      continue;
    }

    console.log(''); //* don't remove
    print.title(
      `================ ${stepIndex + 1} / ${stepsList.length} - ${step.category
      } - ${step.title ? step.title : 'untitled step'} =====================`,
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
        `${substepIndex + 1} / ${substepsList.length} - ${substep.title ?? 'untitled substep'
        }`,
      );

      if (substep.apps) {
        for (let appIndex = 0; appIndex < substep.apps.length; appIndex++) {
          const appsList = substep.apps;
          const app = substep.apps[appIndex];

          print.title(`${appIndex + 1} / ${appsList.length} - [app] ${app}`);
          if (!config.dryRun) {
            try {
              command(`${config.installCommandPrefix} ${app}`);
            } catch (err) {
              log({
                orderStr: `${appIndex + 1} / ${appsList.length}`,
                title: `[app] ${app}`,
                msg: `${err}`,
              });
            }
          }
        }
      }

      if (substep.cmd) {
        const cmdList = substep.cmd;
        if (!config.dryRun && Array.isArray(cmdList)) {
          for (let cmdIndex = 0; cmdIndex < cmdList.length; cmdIndex++) {
            const cmd = cmdList[cmdIndex];

            try {
              print.title(
                `${cmdIndex + 1} / ${cmdList.length} - [cmd] "${cmd.slice(
                  0,
                  21,
                )}..."`,
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
  }

  console.log();
  print.title('======== Manual Steps ===========');
  manualSteps.forEach((step, index) => {
    if (typeof step == 'string') {
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

const argsShortHand = {
  h: 'help',
  d: 'dryRun',
  l: 'list',
};

interface Arg {
  value: boolean | string | number,
  dependencies?: string[],
  dependencyOf?: string[],
}
type Args = {
  help: { value: boolean },
  run: { value: boolean },
  check: { value: boolean, dependencies?: string[], dependencyOf?: string[] },
  dryRun: { value: boolean, dependencies?: string[], dependencyOf?: string[] },
  list: { value: boolean, dependencies?: string[], dependencyOf?: string[] },
  listDisabledSteps: { value: boolean, dependencies?: string[], dependencyOf?: string[] },
};
//! order matters
const defaultArgs: Args = {
  help: {
    value: false
  },
  run: {
    value: false
  },
  check: {
    value: true,
    dependencyOf: ['run'],
  },
  dryRun: {
    value: false,
    dependencyOf: ['run'],
  },
  list: {
    dependencies: ['listDisabledSteps'],
    value: false,
  },
  listDisabledSteps: {
    dependencyOf: ['list'],
    value: false,
  }
};

function handleSqueezedFlags(argsString) {
  const shortArgsList = argsString.split('-')[1].split('');
  for (const shortArg of shortArgsList) {
    defaultArgs[argsShortHand[shortArg]].value = true;
  }
}
function handleShortArgs(args: string) {
  if (args.includes(':')) {
    // there is no squeezing for key-value
    if (args.length > 2) {
      let errorMsg = 'Err: No squeezing for key-value pairs!';
      errorMsg +=
        "\nIf you intend to shorthand a key-value argument, make sure there is only one letter after '-' and before ':'";
      errorMsg += `\nThe flawed argument: ${args}`;

      throw Error(errorMsg);
    }

    const [key, value] = args.split('-')[1].split(':');
    // todo: parse value types
    defaultArgs[argsShortHand[key]].value = value;
  } else {
    // flags squeezed into one
    if (args.length > 2) {
      return handleSqueezedFlags(args);
    }

    // only one flag
    defaultArgs[argsShortHand[args.split('-')[1]]].value = true;
  }
}

function handleFullArgs(args: string) {
  // console.log(args)
  if (args.includes(':')) {
    const [key, value] = args.split(':');
    // todo: parse value types
    if (parseInt(value)) {
      defaultArgs[key].value = parseInt(value);
    } else if (value === "false" || value === "true") {
      defaultArgs[key].value = JSON.parse(value);
    } else {
      defaultArgs[key].value = value;
    }
  } else {
    defaultArgs[args].value = true;
  }
}

// modifies defaultArgs to store new args' values
function parseArgs() {
  // depending on whether you use nodejs or deno: in deno use 0, in nodejs use 2
  const argsStartIndex = 0;
  process.args
    .slice(argsStartIndex)
    .forEach(
      (optionArg: string) => {
        if (optionArg.includes('-')) {
          handleShortArgs(optionArg);
          return;
        }
        handleFullArgs(optionArg);
      },
    );

  return defaultArgs;
}

function listApps() {
  let appsListOutput = "";

  const stepsList = steps;
  for (let stepIndex = 0; stepIndex < stepsList.length; stepIndex++) {
    const step = stepsList[stepIndex];
    const substepsList = step.substeps;
    for (
      let substepIndex = 0;
      substepIndex < substepsList.length;
      substepIndex++
    ) {
      const substep = substepsList[substepIndex];
      if (substep.apps) {
        for (let appIndex = 0; appIndex < substep.apps.length; appIndex++) {
          const appsList = substep.apps;
          const app = substep.apps[appIndex];
          appsListOutput += ` ${app}`;
          // console.log(app);
        }
      }
    }
  }

  console.log(appsListOutput)
}

const main = async () => {
  const args = parseArgs();
  console.log({ args })

  const options: { [key: string]: ((args?: any) => any) | ((args?: any) => Promise<any>) } = {
    listApps: () => {
      listApps();
    },
    // list steps
    list: ({ includeDisabled }: { includeDisabled: string }) => {
      // console.log({ includeDisabled: Boolean(includeDisabled) })
      let stepsList = steps;
      if (!Number(includeDisabled)) {
        stepsList = steps.filter((step) => step.enabled !== false);
      }
      stepsList.forEach((step, stepIndex, list) => {
        print[step.enabled === false ? 'error' : 'title'](
          `${stepIndex + 1} / ${list.length} - ${step.category} - ${step.title
          }`,
        );
      });
    },
    help: () => {
      print.info('WIP :)');
    },
    run: async () => {
      if (args.check.value) {
        print.info('setting up environment...');
        const env = loadEnv();
        if (!env.allSet) {
          throw Error(`The environment wasn't setup!\n${env}`);
        }
      }

      if(args.dryRun.value){
        config.dryRun = true;
      }

      await runSteps();
    },
  };

  for (const argKey of Object.keys(args)) {
    const arg = args[argKey];
    if (!arg.dependencyOf) {
      if (arg.value == false) { continue; }
      await options[argKey]();
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
