import fs from 'node:fs';
import util from 'node:util';

const process = Deno;

// --------------------------------------------------------------------
// ------------------------------ CONFIGURATION -----------------------
// --------------------------------------------------------------------

interface Drive {
  serial: string;
  mountPath: string;
}
interface Config {
  username: string;
  bkp: {
    drives: Record<'D' | 'D2', Drive>;
    directory: string;
    installScriptUrl: string;
    repo: {
      webUrl: string;
      sshUrl: string;
      localURI: string;
    };
    dotfiles: {
      path: string;
    };
  };
  dryRun: boolean;
  path: {
    log: string;
    checkpointDaemon: string;
    checkpointScript: string;
    tty1ServiceConfig: string;
  };
  defaults: {
    template: 'desktop' | 'homeServer';
    proceedAfterRebootStepID: string,
    terminal: string,
    modes: {
      desktop: {
        externalHome: boolean;
      },
      homeServer: {};
    }
  };
  installCommandPrefix: string;
}
const config: Config = {
  username: 'venego',
  bkp: {
    drives: {
      D: { serial: 'ZA465ASK', mountPath: '/media/D' },
      D2: { serial: '23SBW0CAT', mountPath: '/media/D2' }
    },
    directory: 'bkp/bkpos',
    installScriptUrl: 'https://dozy.netlify.app/users/anasouardini/debian/install.sh',
    // directory: 'bkp/homeSetup',
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
    log: ``,
    checkpointDaemon: '',
    checkpointScript: '',
    tty1ServiceConfig: '/etc/systemd/system/getty@tty1.service.d/nologin.config';
  },
  defaults: {
    template: 'desktop',
    proceedAfterRebootStepID: '',
    terminal: 'alacritty',
    modes: {
      desktop: {
        externalHome: true,
      },
      homeServer: {
        externalHome: true,
      },
    }
  },
  installCommandPrefix: "sudo apt-get install -y"
};
config.bkp.repo.localURI = `${config.bkp.drives.D.mountPath}/bkp/bkpRepos/.dotfiles.git`;
config.path.log = `${config.bkp.drives.D.mountPath}/${config.bkp.directory}/home/${config.username}/postInstallation.log`;
config.path.checkpointDaemon = `/home/${config.username}/.config/systemd/user/checkpoint.service`;
config.path.checkpointScript = `/home/${config.username}/.config/systemd/user/checkpoint.sh`;

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
      | grep "${config.bkp.drives.D.serial}" \\
      | awk '{print $2}'); \\
      if [[ ! $BKP_DRIVE_ATTACHED == "${config.bkp.drives.D.serial}" ]];then \\
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
         | grep "${config.bkp.drives.D.serial}" \\
         | awk '{print $1}'); \\
      # BKP_DRIVE_MOUNT=$(printf "$OUTPUT" \\
      #  | grep "└─"$DRIVE_NAME \\
      #  | awk '{print $1}'); \\
        BKP_DRIVE_MOUNT=$(mount \\
         | grep $DRIVE_NAME \\
         | grep "${config.bkp.drives.D.mountPath}");
      if [[ -z $BKP_DRIVE_MOUNT ]]; then \\
        echo "err" >&2; \\
      fi
    # if [[ ! $BKP_DRIVE_MOUNT == "${config.bkp.drives.D.mountPath}" ]]; then \\
    #   echo "err" >&2; \\
    # fi
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
    // allSet: true,
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
            | grep "${config.bkp.drives.D.serial}" \\
            | awk '{print $1}'); \\
          BKP_DRIVE_MOUNT=$(printf "$OUTPUT" \\
            | grep "└─"$DRIVE_NAME \\
            | awk '{print $1}'); \\
          if [[ ! $BKP_DRIVE_MOUNT == "${config.bkp.drives.D.mountPath}" ]]; then \\
            sudo mkdir -p "${config.bkp.drives.D.mountPath}"; \\
            sudo mount "/dev/"$DRIVE_NAME"1" "${config.bkp.drives.D.mountPath}"; \\
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

type Category = 'common' | 'homeServer' | 'desktop' | 'termux' | 'arch' | 'bro' | 'myDrive';
type Steps = {
  title: string;
  category: Category | Category[];
  enabled?: boolean;
  id?: string;
  dependsOn?: string[];
  substeps: {
    title?: string;
    cmd?: string[];
    apps?: string[];
    enabled?: boolean;
    id?: string;
    dependsOn?: string[];
  }[];
};

// ======== STAGES: ==========
// STAGE I: only really essential stesp for setting up a desktop are ran
//         - settings (time, permissions, restore /etc), xorg, i3, polybar, setup-fstab, terminal, zsh-config
// STAGE II: the rest of the steps
//         - make sure to inform the user when important stesp are done
//         - e.g: browser, vscode, clockify, nodejs, tsx
const steps: Steps[] = [
  // first-essential
  {
    title: `Checking if you are root (which you shouldn't be!)`,
    category: 'common',
    substeps: [
      {
        cmd: [
          //? do not run as root
	  `[[ $(whoami) == "root" ]] && sudo pkill deno; sudo pkill node; sudo pkill bun`,
          //? you should have sudo installed
	  `[[ ! "$(pgrep -x sudo)" ]] && sudo pkill deno; sudo pkill node; sudo pkill bun`
	],
      },
    ],
  },
  {
    category: 'common',
    title: 'installing apt config dependencies',
    substeps: [
      {
        apps: ['rsync'],
      },
    ],
  },
  {
    category: 'common',
    title: 'restore config',
    substeps: [
      {
        title: 'restore apt config',
        cmd: [
          `sudo rsync -avh ${config.bkp.drives.D.mountPath}/${config.bkp.directory}/etc/apt /etc/`,
        ],
      },
      {
        title: 'restore keyrings for apt',
        cmd: [
          `sudo rsync -avh ${config.bkp.drives.D.mountPath}/${config.bkp.directory}/usr/share/keyrings /usr/share/`,
          // `mkdir -p $HOME/.local/share;`,
          // `sudo rsync -avh ${config.bkp.drive.mountPath}/${config.bkp.directory}/home/$config.username/.local/share/keyrings $HOME/.local/share/`,
        ],
      },
      {
        title: 'updating repositories',
        cmd: ['sudo apt-get update -y;'],
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
    title: 'disable beep sound',
    category: 'common',
    substeps: [
      {
        cmd: [`
               # disable system beep
               sudo modprobe -r pcspkr 2>/dev/null || true
               # disable system beep (2nd method)
               ( echo -n -e '\\x1b[11m' > /dev/tty0 ) 2>/dev/null
            `],
      },
    ],
  },
  {
    category: 'desktop',
    title: 'configuring permissions',
    substeps: [
      {
        cmd: [
          'echo "$USER ALL=(ALL:ALL) NOPASSWD: /sbin/reboot, /sbin/shutdown, /sbin/poweroff, /usr/bin/chvt" | sudo tee -a /etc/sudoers;',
        ],
      },
    ],
  },
  {
    category: 'common',
    title: 'mouse/kb setup',
    substeps: [
      {
        title: 'copy mouse/keyboard config over',
        cmd: [
          `sudo rsync -avh ${config.bkp.drives.D.mountPath}/${config.bkp.directory}/etc/X11/xorg.conf.d /etc/X11/`,
        ],
      },
    ],
  },
  {
    category: 'common',
    title: 'installing standard utils',
    substeps: [
      {
        cmd: ['sudo tasksel install standard'],
      },
    ],
  },
    {
    category: 'desktop',
    title: 'setting up fstab',
    substeps: [
      {
        cmd: [
          `ls /dev/disk/by-id | grep "${config.bkp.drives.D.serial}" | grep "part1" | awk '{print "/dev/disk/by-id/"$1" ${config.bkp.drives.D.mountPath} ext4 defaults,nofail 0 2"}' | sudo tee -a /etc/fstab`,
          `echo "${config.bkp.drives.D.mountPath}/bkp/homeSetup/home /home		ext4 defaults,nofail,bind	0	2" | sudo tee -a /etc/fstab`,
        ]
      }
    ],
  },
  {
    category: 'common',
    title: 'reduce grub timeout',
    substeps: [
      {
        cmd: [
          `sudo sed 's|^GRUB_TIMEOUT=[0-9]\+$|GRUB_TIMEOUT=1|' -i /etc/default/grub`,
        ]
      }
    ],
  },
  {
    category: 'desktop',
    title: 'X11 - only the essential part',
    substeps: [
      {
        apps: ['xorg'],
      },
    ],
  },
  {
    category: 'desktop',
    title: 'desktop user interface UI - only the i3 before rebooting and then the rest after reboot',
    substeps: [
      {
        title: 'wm and status bar - X11',
        apps: ['i3'],
      },
    ]
  },
  {
    category: 'desktop',
    title: 'terminal',
    substeps: [
      {
        apps: [
          config.defaults.terminal,
          //  'kitty'
        ],
      },
    ],
  },
  {
    category: 'common',
    title: 'setup zsh - esential part',
    substeps: [
      {
        apps: ['zsh'],
      },
      {
        cmd: [
          `sudo chsh -s /bin/zsh $USER`,
        ],
      },
    ],
  },
  // make checkpoint-daemon and checkpoint-script
  {
    title: 'reboot into the 2nd half of installation',
    category: 'common',
    id: 'make_checkpoint_for_second_half',
    substeps: [
      {
        cmd: [
          // mount /home from 2nd drive
          `sudo mount --bind ${config.bkp.drives.D.mountPath}/bkp/homeSetup/home /home`,
	   
          // setting up checkpoint daemon
	  mkdir -p .config/systemd/user
          `touch ${config.path.checkpointDaemon}`,

          `echo "[Unit]" | tee -a ${config.path.checkpointDaemon}`,
          `echo "Description=Run Once After X11 Starts" | tee -a ${config.path.checkpointDaemon}`,
          `echo "After=network.target" | tee -a ${config.path.checkpointDaemon}`,
          `echo "" | tee -a ${config.path.checkpointDaemon}`,
          `echo "[Service]" | tee -a ${config.path.checkpointDaemon}`,
          `echo "Environment=DISPLAY=:0" | tee -a ${config.path.checkpointDaemon}`,
          `echo "ExecStart=/usr/bin/bash .config/systemd/user/test.sh" | tee -a ${config.path.checkpointDaemon}`,
          `echo "Type=oneshot" | tee -a ${config.path.checkpointDaemon}`,
          `echo "RemainAfterExit=no" | tee -a ${config.path.checkpointDaemon}`,
          `echo "" | tee -a ${config.path.checkpointDaemon}`,
          `echo "[Install]" | tee -a ${config.path.checkpointDaemon}`,
          `echo "WantedBy=default.target" | tee -a ${config.path.checkpointDaemon}`,

          // enabling checkpoint daemon
          `systemctl --user enable ${config.path.checkpointDaemon}`,

          // setting up checkpoint script
          `touch ${config.path.checkpointScript}`,
          `echo "#!/bin/zsh\n" | tee -a ${config.path.checkpointScript}`,
          `echo "source /home/${config.username}/.zshrc;" | tee -a ${config.path.checkpointScript}`,
          `echo "startx&" | tee -a ${config.path.checkpointScript}`,
          `echo "while ! pgrep -x i3 > /dev/null; do sleep 1; done;" | tee -a ${config.path.checkpointScript}`,
          // empty terminal. At first boot, there are no keybindings
          `echo "/usr/bin/alacritty&\n" | tee -a ${config.path.checkpointScript}`,
          `echo "/usr/bin/alacritty --hold -e zsh -c 'bash <(curl -sfSL ${config.bkp.installScriptUrl}) run offsetID:${config.defaults.proceedAfterRebootStepID}'" | tee -a ${config.path.checkpointScript}`,
          // `echo "sudo systemctl enable getty@tty1.service" | tee -a ${config.path.checkpointScript}`,
          `echo "restoring login prompt, after 2nd half of post-installation is done" | tee -a ${config.path.checkpointScript}`,
          `echo "sudo rm -rf \"${config.path.tty1ServiceConfig}\"" | tee -a ${config.path.checkpointScript}`,

          // disable login prompt for the 2nd half of the installation to go without interruption
	  // `sudo systemctl disable getty@tty1.service`,
          `echo "[Service]" | sudo tee -a "${config.path.tty1ServiceConfig}"`,
          `echo "ExecStart=" | sudo tee -a "${config.path.tty1ServiceConfig}"`,
          `echo "ExecStart=-/sbin/agetty -o '-p -f -- \\u' --autologin ${config.username} --noclear %I $TERM" | sudo tee -a "${config.path.tty1ServiceConfig}"`,

          // reboot to continue the 2nd half wile the OS is useable
          `sudo reboot now`
        ]
      }
    ]
  },
  // the prior step will hopefully reboot before reaching this step
  // but keep the stopper step in here just in case
  {
    category: 'common',
    title: 'stopper',
    id: 'stopper',
    substeps: [],
  },
  // this step is ran by checkpoint-script after reboot
  {
    title: 'picking installation from before rebooting',
    category: 'common',
    id: config.defaults.proceedAfterRebootStepID,
    substeps: [
      {
        cmd: [
          `systemctl --user disable ${config.path.checkpointDaemon}`, // it's disabled automatically, but leave this just in case
          `rm -rf ${config.path.checkpointDaemon}`,
          `rm -rf ${config.path.checkpointScript}`
        ]
      }
    ]
  },
  //! TODO: some apps will override your config files (some will backup, some won't)
  //! TODO: - only solution is to backup your config files before installing those apps and restore them after
  //! TODO: - so you have to test the apps one-by-one to konw which ones to be careful with

  // SECOND-ESSENTIALS
  {
    category: 'common',
    title: 'setting up zsh - after essentials part',
    substeps: [
      {
        apps: ['zsh-autosuggestions', 'zsh-syntax-highlighting'],
      },
      {
        cmd: [
          'zsh <(curl -s https://raw.githubusercontent.com/zap-zsh/zap/master/install.zsh) --branch release-v1',
	  'source .zshrc'
        ],
      },
    ],
  },
  {
    category: 'desktop',
    title: 'desktop user interface UI - after the essentials',
    substeps: [
      {
        title: 'wm and status bar - X11',
        apps: ['i3', 'polybar'],
      },
      {
        title: 'app luncher and menu',
        apps: ['suckless-tools', /*'rofi'*/],
      },
      {
        title: 'hot key daemon',
        apps: ['sxhkd'],
      },
      {
        title: 'installing keyboard key mapper (keyd)',
	enabled: false,
        cmd: [
          `
          reposDIR="$HOME/repos"
	  mkdir -p $reposDIR;
          DIR="$reposDIR/keyd"
          DATE=$(date +%F)
          if [ -d "$DIR" ]; then
              NEW_DIR="${DIR}_$DATE"
              mv "$DIR" "$NEW_DIR"
              echo "Directory renamed to: $NEW_DIR"
          fi
	  cd $reposDIR; \\
          git clone https://github.com/rvaiya/keyd; \\
          sudo apt-get install gcc make -y; \\
          cd keyd; \\
          make && sudo make install; \\
          sudo systemctl enable keyd && sudo systemctl start keyd; \\
          sudo usermod -aG keyd $USER; \\
          sudo rsync -avh ${config.bkp.drives.D.mountPath}/${config.bkp.directory}/etc/keyd/default.conf /etc/keyd/;
          `,
        ],
      },
      {
        title: 'installing keyboard key mapper (kmonad)',
        cmd: [
          `
          reposDIR="$HOME/repos"
	  mkdir -p $reposDIR;
          DIR="$reposDIR/kmonad"
          DATE=$(date +%F)
          if [ -d "$DIR" ]; then
              NEW_DIR="${DIR}_$DATE"
              mv "$DIR" "$NEW_DIR"
              echo "Directory renamed to: $NEW_DIR"
          fi
	  cd $reposDIR; \\
          sudo apt update
          sudo apt install -y build-essential libev-dev libxcb-xkb-dev libx11-dev libxkbfile-dev libxrandr-dev libxinerama-dev libxfixes-dev
          curl -sSL https://get.haskellstack.org/ | sh
          git clone https://github.com/kmonad/kmonad.git
          cd kmonad
          stack setup; stack build; stack install;
          echo "$USER ALL=(ALL:ALL) NOPASSWD: /home/$USER/.local/bin/kmonad" | sudo tee -a /etc/sudoers;
          `,
        ],
      },
    ],
  },
  {
    category: 'desktop',
    title: 'audio tools',
    substeps: [
      {
        apps: [
	  // 'pulseaudio', 
	  // 'alsa-utils',
          "pipewire",
          "pipewire-alsa",
          "pipewire-audio",
          "pipewire-pulse",
	  'pavucontrol'
	],
      },
    ],
  },
  {
    category: 'common',
    title: 'package managers',
    id: 'package_managers',
    substeps: [
      {
        apps: ['nala'],
      },
      {
        title: "Installing and setting up flatpak",
        id: 'flatpak',
        apps: ['flatpak'],
        cmd: [
          // this needs password input, leave it within early steps
          'flatpak remote-add --if-not-exists flathub https://flathub.org/repo/flathub.flatpakrepo',
          'sudo mount --bind /media/D/bkp/flatpak /var/lib/flatpak',
          `echo "${config.bkp.drives.D.mountPath}/bkp/flatpak /var/lib/flatpak		ext4 defaults,nofail,bind	0	2" | sudo tee -a /etc/fstab`,
        ],
      },
      {
        title: "Installing Nix (the package manager)",
        cmd: [
          'yes | sh <(curl -L https://nixos.org/nix/install) --daemon',
          'sudo mount --bind /media/D/bkp/nix/store /nix/store',
          `echo "${config.bkp.drives.D.mountPath}/bkp/nix/store /nix/store		ext4 defaults,nofail,bind	0	2" | sudo tee -a /etc/fstab`,
        ],
      },
    ],
  },
  {
    category: 'desktop',
    title: 'browsers',
    substeps: [
      {
        apps: ['brave-browser'],
      },
      {
        // essential setup shouldn't install these
        // if you need these enabled, move them beyond the 'reboot/checkpoint' step
        enabled: false,
        apps: ['chromium', 'google-chrome-stable'],
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
            sudo apt-get install npm -y; \\
            sudo npm i -g corepack; \\
            sudo npm i -g pnpm; \\
            corepack enable; \\
            pnpm i -g pnpm;
          `,
        ],
      },
    ],
  },
  {
    category: 'common',
    title: 'databases',
    substeps: [
      {
        enabled: false, // mysql sux, doesn't suuport unattended installation
        title: 'installing MySQL',
	cmd: [
	  `sudo apt install mysql-server --mode unattended --mysqluser root --mysqlpassword root`,
	  `sudo mysql -u root -p -e "CREATE USER 'venego'@'localhost' IDENTIFIED BY 'venego'"`,
	  `sudo mysql -u root -p -e "GRANT ALL PRIVILEGES ON *.* TO 'venego'@'localhost' WITH GRANT OPTION"`
	]
      },
      {
        title: 'mysql DBs restore',
	cmd: [
          'sudo mount --bind /media/D/bkp/bkpos/var/lib/mysql /var/lib/mysql',
          `echo "${config.bkp.drives.D.mountPath}/bkp/bkpos/var/lib/mysql	/var/lib/mysql	ext4 defaults,nofail,bind	0	2" | sudo tee -a /etc/fstab`,
	]
      },
      {
        title: 'installing sqlite3',
        apps: ['sqlite3'],
      },
    ],
  },
  {
    category: 'desktop',
    title: 'installing node packages',
    substeps: [
      {
        cmd: ['pnpm i -g prettier typescript tsx clockify'],
      },
    ],
  },
  {
    category: 'common',
    title: 'editors',
    substeps: [
      {
        enabled: false,
        title: 'installing lazyvim (nvim distro) from repo',
        cmd: [
          'git clone https://github.com/LazyVim/starter $HOME/.config/nvim',
          'rm -rf $HOME/.config/nvim/.git',
          'sudo apt update -y',
        ],
      },
      {
        title: '',
        apps: ['code'],
      },
      {
        enabled: false,
        title: 'installing zed',
        cmd: ['curl -f https://zed.dev/install.sh | sh']
      }
    ],
  },
  {
    category: 'desktop',
    title: 'password GUI prompt',
    substeps: [
      {
        title: 'a password prompt for privs escalation (for GUI apps)',
        apps: ['policykit-1-gnome', 'pinentry-qt'],
      },
    ],
  },
  {
    category: 'common',
    title: 'setup swap file',
    substeps: [
      {
        cmd: [
          'sudo swapoff -a',
          'sudo touch /swapfile',
          'sudo dd if=/dev/zero of=/swapfile bs=1MB count=8000',
          'sudo chmod 600 /swapfile',
          'sudo mkswap /swapfile',
          'sudo swapon /swapfile',
          'echo "/swapfile swap    swap    0   0" | sudo tee -a /etc/fstab',
          'echo "vm.swappiness = 10" | sudo tee -a /etc/sysctl.conf',
          'sudo findmnt --verify --verbose',
        ],
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
            LAZYGIT_VERSION=$(curl -s "https://api.github.com/repos/jesseduffield/lazygit/releases/latest" | grep -Po '"tag_name": "v\\K[^"]*'); \\
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
          // 'yt-dlp',
          'flameshot',
          'simplescreenrecorder',
          'zathura',
          'zathura-pdf-poppler',
          // "obs-studio",
          // "cheese",
          'mpv',
          // 'mpd',
          // 'ncmpcpp',
          // 'mpc',
          'sxiv',
          'gimp',
          // "xloadimage", // it has 'xsetbg': used for setting BG image
          // "imagemagick",
          "feh",
	  'xzoom', // magnification tool
	  // 'kmag', // magnification tool
        ],
      },
      {
        enabled: false, // enable flatpak step if you want to use this.
        title: 'installing media tools from flatpak',
        cmd: [
          // 'sudo apt-get install flatpak -y',
          // 'flatpak remote-add --if-not-exists flathub https://flathub.org/repo/flathub.flatpakrepo',
          'timeout 60 flatpak install flathub org.nickvision.tubeconverter',
          'timeout 60 flatpak install flathub org.localsend.localsend_app',
        ],
        dependsOn: ['package-managers.flatpak'],
      },
      {
        enabled: false,
        title: 'installing droidCam',
        cmd: [
          `mkdir -p $HOME/Downloads/droidCam && cd $HOME/Downloads/droidCam \\
          wget -O droidcam_latest.zip https://files.dev47apps.net/linux/droidcam_2.0.0.zip \\
          unzip droidcam_latest.zip \\
          sudo ./install-client \\
          sudo apt-get install linux-headers-\`uname -r\` gcc make \\
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
        apps: ['ripgrep', 'btop', 'fd-find', 'ncdu', 'bat', 'tldr'],
      },
    ],
  },
  {
    category: 'common',
    title: 'net stuff',
    substeps: [
      {
        apps: [
          'net-tools',
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
          'netplan.io',
          // "dsniff",
          'proftpd',
          'hping3',
          // "speedtest-cli",
          // "macchanger", // can't install unattendenly
        ],
      },
      {
	title: 'network monitoring'
	apps: ['vnstat'],
	cmd: [
          'sudo mount --bind /media/D/bkp/bkpos/var/lib/vnstat /var/lib/vnstat',
          `echo "${config.bkp.drives.D.mountPath}/bkp/bkpos/var/lib/vnstat	/var/lib/vnstat		ext4 defaults,nofail,bind	0	2" | sudo tee -a /etc/fstab`,
	]
      },
      {
	title: 'setting dns'
	cmd: [
          'echo "nameserver 1.1.1.1" | sudo tee /etc/resolv.conf',
          `echo "${config.bkp.drives.D.mountPath}/bkp/bkpos/var/lib/vnstat	/var/lib/vnstat		ext4 defaults,nofail,bind	0	2" | sudo tee -a /etc/fstab`,
	]
      }
    ],
  },
  {
    category: 'common',
    title: 'basic misc tools',
    substeps: [
      {
        apps: [
          'rsync',
          'bc',
          'tree',
          // 'trash-cli',
          // 'rename',
          // 'whois',
          'fzf',
          'pkexec', // balena etcher needs this
          'preload', // for preloading frequently used apps in memory
          // 'picom', // for windows transparency
        ],
      },
    ],
  },
  {
    category: 'common',
    title: 'phone integration tools',
    substeps: [
      {
        cmd: [
          `# for Debian/Ubuntu
           sudo apt install ffmpeg libsdl2-2.0-0 adb wget \
           gcc git pkg-config meson ninja-build libsdl2-dev \
           libavcodec-dev libavdevice-dev libavformat-dev libavutil-dev \
           libswresample-dev libusb-1.0-0 libusb-1.0-0-dev`,
           `
	   cd ~/home/repos;
	   git clone https://github.com/Genymobile/scrcpy
           cd scrcpy
           ./install_release.sh`
        ]
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
          'pulseaudio-module-bluetooth',
          'pipewire',
          'pipewire-pulse',
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
        apps: ['build-essential', 'libx11-dev', 'gcc', 'make', 'cmake'],
      },
    ],
  },
  {
    category: 'common',
    title: 'disk tools',
    substeps: [
      {
        title: 'partitioning, resizing, etc',
        apps: ['dosfstools', 'gdisk', 'lvm2', 'smartmontools'],
      },
      // {
      //   enabled: false,
      //   title: 'backup',
      //   apps: ['timeshift'],
      // },
    ],
  },
  {
    enabled: false,
    category: 'common',
    title: 'android tools',
    substeps: [
      {
        apps: ['adb', 'fastboot'],
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
        apps: ['docker.io', 'docker-compose'],
      },
      {
        title: 'adding user to docker group',
        cmd: [`sudo usermod -aG docker $USER`],
      },
      {
        title: 'qemu shared dependencies',
        apps: ['qemu-system', 'libvirt-daemon-system'],
      },
      {
        enabled: false, // enable when using CLI-only
        title: 'qemu CLI dependencies - enable if you disable GUI client',
        apps: ['libvirt-clients', 'qemu-utils', 'ovmf'],
      },
      {
        title: 'CLI client',
        apps: ['virtinst'],
      },
      {
        title: 'GUI client',
        apps: ['virt-manager'],
      },
      {
        title: 'qemu viewer',
        apps: ['virt-viewer'],
      },
      {
        title: 'adding user to libvirt groups',
        cmd: [`sudo usermod -aG libvirt,libvirt-qemu $USER`],
      },
      {
        apps: ['distrobox'],
      },
    ],
  },
  {
    category: 'common',
    title: 'security',
    substeps: [
      {
        enabled: false,
        apps: ['firejail'],
      },
      {
        apps: ['apparmor'],
      },
      {
        enabled: false,
        apps: ['fail2ban'],
        cmd: ['sudo systemctl enable fail2ban --now']
      },
      {
        apps: ['ufw'],
        cmd: [
          'sudo ufw limit 22/tcp',
          'sudo ufw allow 80/tcp',
          'sudo ufw allow 443/tcp',
          'sudo ufw default allow outgoing',
          'sudo ufw default deny incoming',
          'sudo ufw allow in on tailscale0', // you'll need this for Tailscale
          'sudo ufw enable',
        ]
      },
      {
        enabled: false,
        apps: ['tor', 'proxychains'],
      },
      {
        apps: ['pass', 'pinentry-qt'],
        // TODO: make this more generic: get gpg key id by email
        cmd: ['pass init 29E7111E31B67AD036E371BC2DC6D6ACC9718E3E'],
      },
      {
        title: 'a password prompt for privs escalation (for GUI apps)',
        apps: ['policykit-1-gnome'],
      },
    ],
  },
  {
    category: 'desktop',
    title: 'desktop user interface UI',
    substeps: [
      {
        title: 'notifications',
        apps: ['dbus-x11', 'notification-daemon', 'libnotify-bin', 'dunst'],
      },
      // sometimes 'dunst' is so buggy, I need a simpler solution
      {
        title: 'notifications-done-simply',
        apps: ['zenity'],
      },
      {
        title: 'wm and status bar - X11',
        apps: ['i3', 'polybar'],
      },
      {
        title: 'clipboard manager',
        apps: ['diodon'],
      },
      {
        enabled: false,
        title: 'wm and status bar - wayland',
        apps: ['sway', 'swaync', 'waybar'],
      },
      {
        title: 'app luncher and menu',
        apps: ['suckless-tools', /*'rofi'*/],
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
          sudo apt-get install gcc make -y; \\
          cd keyd; \\
          make && sudo make install; \\
          sudo systemctl enable keyd && sudo systemctl start keyd; \\
          sudo usermod -aG keyd $USER; \\
          sudo rsync -avh ${config.bkp.drives.D.mountPath}/${config.bkp.directory}/etc/keyd/default.conf /etc/keyd/;
          `,
        ],
      },
      {
        enabled: false,
        title: "build pywal from source",
        apps: ['python3', 'python3-venv', 'python3-pip', 'pidof', 'imagemagick'], // dependencies
        cmd: [
          `
          git clone https://github.com/dylanaraps/pywal \\
          cd pywal \\
          python3 -m venv ~/pywal-venv \\
          source ~/pywal-venv/bin/activate \\
          pip3 install . \\
          deactivate
          `
        ]
      },
    ],
  },
  {
    category: 'desktop',
    title: 'file management',
    substeps: [
      {
        enabled: false,
        title: "ranger",
        apps: ['ranger'],
      },
      {
        title: "yazi",
        cmd: [
          `bash <(curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs) -y`,
          `source $HOME/.cargo/env; \\
	         rustup update; \\
	         cargo install --locked yazi-fm yazi-cli;`,
          `which nix-env && [[ $? ]] && timeout 60 nix-env -iA nixpkgs.ueberzugpp`
        ]
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
          'sudo apt-get install $HOME/Downloads/libssl.deb -y',
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
        apps: ['plexmediaserver'],
      },
    ],
  },
  {
    // disabled: I always mount another home directory from another drive
    enabled: false,
    title: 'remove useless dirs',
    category: 'common',
    substeps: [
      {
        cmd: [
          `cd $HOME && sudo rm -rf Public Videos Templates Pictures Music Documents`,
        ],
      },
    ],
  },
  {
    // I mount the home straight from another drive now, no need for this
    enabled: false,
    title: 'syncing/restore files from bkp drive',
    category: 'desktop',
    substeps: [
      {
        cmd: [
          `sudo rsync -avh ${config.bkp.drives.D.mountPath}/${config.bkp.directory}/home/$USER/* $HOME/;`,
          // `sudo rsync -avh ${config.bkp.drive.mountPath}/${config.bkp.directory}/home/$USER/home $HOME/;`,
          // `sudo rsync -avh ${config.bkp.drive.mountPath}/${config.bkp.directory}/home/$USER/.config $HOME/;`,
          // `sudo rsync -avh ${config.bkp.drive.mountPath}/${config.bkp.directory}/home/$USER/.vscode $HOME/;`,
          // `sudo rsync -avh ${config.bkp.drive.mountPath}/${config.bkp.directory}/home/$USER/.gnupg $HOME/;`,
          // `sudo rsync -avh ${config.bkp.drive.mountPath}/${config.bkp.directory}/home/$USER/.password-store $HOME/;`,
        ],
      },
    ],
  },
  {
    // I don't use git for this anymore
    enabled: false,
    category: 'common',
    title: 'setting up dotfiles',
    substeps: [
      {
        title: 'restore ssh keys',
        cmd: [
          `sudo rsync -avh ${config.bkp.drives.D.mountPath}/${config.bkp.directory}/home/$USER/.ssh $HOME/`,
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
];

const manualSteps = [
  // 're-login for the default shell to be set', // we re-login automatically now
  'sudo apt install mysql-server -y',
  'sudo apt-get install grub-imageboot-y; add rescue iso to /boot/images; sudo update-grub2;',
];

// --------------------------------------------------------------------
// ------------------------- INSTALLATION RUN -------------------------
// --------------------------------------------------------------------

function validateStepsWIP() {
  const unmetDependencies = {};

  steps.forEach((step, stepIndex) => {
    if (!step.id) { console.log('skipping a step without an id'); return; }

    // check if it's, itself, a dependency and remove it from the list if it is
    Object.entries(unmetDependencies).forEach(([dependency, dependant]) => {
      console.log(`found dependency ${dependency}`);
      if (dependency.split('.')[0] == step?.id) {
        if (!dependency.includes('.')) {
          delete unmetDependencies[dependency];
        }
      }
    })

    // check deps for steps
    if (step.dependsOn) { }

    step.substeps.forEach((subStep) => {

      // dependency found
      if (unmetDependencies.some((item) => item.dependency == dependency?.id)) {
        return;
      }

      // 
      unmetDependencies.push({ dependency, dependant: step.id as string });
    });

    if (unmetDependencies.length) {
      console.log(unmetDependencies);
      throw Error(`Unmet Dependencies!`);
    }
  })
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

interface RunStepsProps {
  offsetID: string | undefined;
  dryRun: boolean;
}
async function runSteps({ offsetID, dryRun }: RunStepsProps) {
  const stepsVars = {
    reachedOffsetID: false,
  }

  const stepsList = steps;
  for (let stepIndex = 0; stepIndex < stepsList.length; stepIndex++) {
    const step = stepsList[stepIndex];

    // stopper for easy debugging
    if (step.title == 'stopper' || step.id == 'stopper') { process.exit(0); }
    // ignore non-specified categories (except for 'common')
    if (step.category !== config.defaults.template && step.category !== 'common') { continue; }
    // ignore disabled steps
    if (step.enabled === false) { continue; }
    // start from a specific step.id
    // console.log({
    //   offsetID,
    //   stepsVars,
    //   cond1: typeof offsetID == 'string',
    //   cond2: stepsVars.reachedOffsetID == false
    // });
    if (typeof offsetID == 'string' && stepsVars.reachedOffsetID == false) {
      console.log('before offset', step.title)
      if (offsetID != step.id) { continue; }
      stepsVars.reachedOffsetID = true;
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

      if (substep.enabled === false) { continue; }

      print.title(
        `${substepIndex + 1} / ${substepsList.length} - ${substep.title ?? 'untitled substep'
        }`,
      );

      if (substep.apps) {
        for (let appIndex = 0; appIndex < substep.apps.length; appIndex++) {
          const appsList = substep.apps;
          const app = substep.apps[appIndex];

          print.title(`${appIndex + 1} / ${appsList.length} - [app] ${app}`);
          if (!dryRun) {
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
        if (!dryRun && Array.isArray(cmdList)) {
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

interface Arg<VT> {
  value: VT
  dependencies?: string[],
  dependencyOf?: string[],
  isMethod?: boolean
}
type Args = {
  help: Arg<boolean>,
  run: Arg<boolean>,
  check: Arg<boolean>,
  dryRun: Arg<boolean>,
  list: Arg<boolean>,
  listApps: Arg<boolean>,
  listDisabledSteps: Arg<boolean>,
  offsetID: Arg<string | undefined>,
};
//! order matters
const defaultArgs: Args = {
  help: {
    value: false,
    isMethod: true,
  },

  run: {
    value: false,
    isMethod: true,
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
    value: false,
    dependencies: ['listApps', 'listDisabledSteps'],
    isMethod: true,
  },
  listApps: {
    value: false,
    dependencyOf: ['list'],
  },
  listDisabledSteps: {
    value: false,
    dependencyOf: ['list'],
  },

  offsetID: {
    value: undefined,
  },
} as const;

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
  if (args.includes(':')) {
    const [key, value] = args.split(':');
    // todo: parse value types
    defaultArgs[key].value = value;
  } else {
    defaultArgs[args].value = true;
  }
}

function parseAdHocArgs() {
  // syncing between the fragmented option 'dryRun'
  if (config.dryRun == true || defaultArgs.dryRun.value == true) {
    defaultArgs.dryRun.value = true;
    config.dryRun = true;
  }

  // 'dryRun' should activate the 'run' option
  if (defaultArgs.dryRun.value == true) {
    defaultArgs.run.value = true;
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

  parseAdHocArgs();

  return defaultArgs;
}

const main = async () => {
  const args = parseArgs();
  console.log(args);

  if (args.check) {
    print.info('setting up environment...');
    const env = loadEnv();
    console.log(env)
    if (!env.allSet) {
      throw Error(`The environment wasn't setup!\n${env}`);
    }
  }

  const options: { [key: string]: ((args?: any) => any) | ((args?: any) => Promise<any>) } = {
    // list steps
    list: () => {
      if (args.listApps) {
        listApps();
        return;
      }

      // console.log({ includeDisabled: Boolean(includeDisabled) })
      let stepsList = steps;
      if (!args.listDisabledSteps) {
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
      print.info(`all args are key-value pairs, if the value is true, you just type it without the ':'`);
      print.info('Usage: deno run --allow-all script-path [...options]')
      print.info('e.g: deno run --allow-all script-path dryRun:true')
      print.info(`e.g: deno run --allow-all script-path dryRun`);
    },
    run: async () => {
      if (args.check && !loadEnv().allSet) { return; }
      if (!args.run) { return; }

      await runSteps({ offsetID: args.offsetID.value, dryRun: args.dryRun.value });
    },
  };

  for (const argKey of Object.keys(args)) {
    const arg = args[argKey as keyof Args];
    if (!arg.dependencyOf && arg.isMethod) {
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

// Enhancement
// [X] reduce steps in 1st stage (before reboot)
// [ ] add a notification system so you can inform the user
//   - when important steps are done

// FEAT
// [ ] specify whether a step is a dependency for another; don't run the step which its depenency was not successful.
//   - this requires lots of non-standard meta-programming for generating hashes of steps, etc

// FIX
// [X] the install.sh script is not working correctly
// [X] make sure the script is run as normal user

// UX
// [ ] add undo function for each step.
// [ ] interactive configuration

// DEBUGGING
// [ ] option to go through each step and prompt for "yes/no"
// [ ] option to run a step/sub-step by it's order
// [ ] fix mode — go over the unsuccessful steps
// [ ] dry-run should tell you if you already have the app installed, configuration done, or file doesn't exist.
// [ ] dry-run should tell you if the command or app is invalid; use the built-in dry-run of apps like rsync
