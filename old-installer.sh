#!/bin/bash

# progress bar
width=$(($(tput cols) - 8))
progress=0
total=0
bkpHost="core2.home"
destRoot="/media/D/bkp/homeBkp"
dest="${bkpHost}:${destRoot}"

function saneRsync() {
	rsync -rvzh --delete --force --perms --executability --times --exclude=node_modules --progress $@
}

# Define a function that draws the progress bar
draw_progress_bar() {
	local width=$1
	local progress=$2
	local total=$3

	# Clear the line and move the cursor to the beginning
	tput cuf 0
	tput el1

	# Calculate the progress percentage
	local percent=$(($progress * 100 / $total))

	# Calculate the number of completed and remaining blocks
	local completed_blocks=$(($progress * $width / $total))
	local remaining_blocks=$(($width - $completed_blocks))
	# printf "%d/%d/%d" $completed_blocks $remaining_blocks $total

	# Print the progress bar
	printf "\033[1;34m[\033[0m"
	for i in $(seq 1 $completed_blocks); do printf "\033[1;34m#\033[0m"; done
	for i in $(seq 1 $remaining_blocks); do printf " "; done
	printf "\033[1;34m] %d%%\033[0m." $percent
}

# Define a function to increment the progress variable
updateProgress() {
	echo -en "\r"

	local increment=$1
	progress=$(($progress + $increment))
	draw_progress_bar $width $progress $total
}

# Define a function to print a message and update the progress bar
printText() {
	# 31 Red
	# 32 Green
	# 33 Yellow

	local text=$1
	local colorNumber=$2

	# cartrige return
	echo -en "\r"
	printf "\033[1;${colorNumber}m> %s\033[0m" "$text" >&2
	# clear the rest of the old progress bar line
	textLength=${#text}
	spacesNumber=$(($(tput cols) - txtLength))

	seq 1 $spacesNumber | while read i; do printf " "; done

	# prints the progess bar after text print
	updateProgress 0
}

# Global Globals
printRed() {
	printText "$@" 31
	# printf '\033[1;31m> %s\033[0m\n' "$@" >&2
}
printGreen() {
	printText "$@" 32
	# printf '\033[1;32m> %s\033[0m\n' "$@" >&2
}
printYellow() {
	printText "$@" 33
	# printf '\033[1;31m> %s\033[0m\n' "$@" >&2
}

logFile=~/installer.log
notInstalledList=~/notInstalled.list

function addToNotInstalledList() {
	echo $1 >>$notInstalledList
}
function log() {
	local messageType="$1"
	local message="$2"
	local timestamp=$(date +"%Y-%m-%d %T")

	logString="[$timestamp] - [$messageType] > $message" >>"$logFile"

	# case "$messageType" in
	#   error) printRed $logString ;;
	#   warning) printYellow $logString ;;
	#   *) echo $logString ;;
	# esac

	echo $logString >>"$logFile"
}

installList() {
	if [ $# -eq 0 ]; then
		echo "Empty list of apps to install"
		return 1
	fi

	# loop through each string in the argument list
	for app in $@; do

		printYellow "Installing ${app}"

		log "============================"
		log ">>>>>> Installing ${app}"
		log "============================"

		sudo apt install -y "$app" 2>>logFile

		if [[ ! $? = 0 ]]; then
			addToNotInstalledList $app
		fi

		updateProgress 1
	done

	return 0
}

# '===================================================================================================='
# '================================= START OF POST-INSTALLATION PROCESS ==============================='
# '===================================================================================================='

# '===================  TODO ====================='
# categorize each software
# nerd fonts
# fix nvim installation duplication

### backup tools
# maintenance - stacer
# preload - a tool that preloads often used packages for faster startups

# vscode + add sources to apt

# printGreen '==================================================='
# printGreen '=========================== One-time configurations'
# printGreen '==================================================='
# # set dash as /bin/sh
# sudo ln -sf dash /bin/sh

total=$(($total + 10))
updatePackages() {
	printGreen '====================================================='
	printGreen '=============================== updating source list'
	printGreen '====================================================='

	# upgrading to debian-testing repo and
	# printYellow "upgrading to debian testing"
	# sudo sh -c 'echo "deb http://deb.debian.org/debian testing main contrib non-free" > /etc/apt/sources.list'

	printYellow "running apt update and upgrade -y"
	sudo apt update -y && sudo apt upgrade -y

	updateProgress 10
}

total=$(($total + 1))
installNala() {
	printGreen '======================================================='
	printGreen '=============================== wrapping apt with nala'
	printGreen '======================================================='

	installList nala
}

# total=$(( $total + 1 ))
installBluetoothTools() {
	printGreen '================================================='
	printGreen '=============================== bluetooth scanner'
	printGreen '================================================='

	printYellow "nothing, still working on it"

	# TODO: get this to work
	# installList bluez bluez-utils
	# bluez creates a deamon called blluetooth

	# updateProgress 1
}

total=$(($total + 8))
installNetStuff() {
	printGreen '================================================='
	printGreen '=============================== install net stuff'
	printGreen '================================================='

	installList netplan.io network-manager wget curl arp-scan dsniff sshfs proftpd hping3
	# installList speedtest-cli
	# installList macchanger
}

total=$(($total + 2))
installBuildEssentials() {
	printGreen '==========================================================='
	printGreen '=============================== installing build-essentials'
	printGreen '==========================================================='

	installList build-essential libx11-dev
}

total=$(($total + 8))
installX11Utils() {
	printGreen '========================================================'
	printGreen '=============================== installing X11 utilities'
	printGreen '========================================================'

	installList xorg xinput arandr sxhkd xdo xdotool xclip xbanish
}

total=$(($total + 18))
installMiscTools() {
	printGreen '======================================================'
	printGreen '=============================== installing basic tools'
	printGreen '======================================================'

	installList rsync bc tree trash-cli rename whois ripgrep fzf git gh btop fd-find ncdu bat
	installList flameshot simplescreenrecorder vlc
	installList tldr
}

total=$(($total + 5))
installDiskTools() {
	printGreen '==========================================='
	printGreen '=============================== Disks tools'
	printGreen '==========================================='

	installList dosfstools
	installList gdisk
	installList lvm2 # lvm
	installList smartmontools
	installList timeshift
}

total=$(($total + 2))
installDocumentReaders() {
	printGreen '==========================================================='
	printGreen '=============================== installing document readers'
	printGreen '==========================================================='

	installList zathura zathura-pdf-poppler
}

total=$(($total + 2))
installDocker() {
	printGreen '================================================='
	printGreen '=============================== installing docker'
	printGreen '================================================='

	installList docker.io docker-compose
}

total=$(($total + 1))
installFireJail() {
	printGreen '==================================================='
	printGreen '=============================== installing firejail'
	printGreen '==================================================='

	installList firejail
}

total=$(($total + 3))
installAudioTools() {
	printGreen '======================================================'
	printGreen '=============================== installing audio tools'
	printGreen '======================================================'

	installList pulseaudio alsa-utils pavucontrol
}

total=$(($total + 4))
installNotificationTools() {
	printGreen '============================================================='
	printGreen '=============================== installing notification tools'
	printGreen '============================================================='

	installList dbus-x11 notification-daemon libnotify-bin dunst
}

total=$(($total + 4))
installDesktop() {
	printGreen '=================================================='
	printGreen '=============================== installing Desktop'
	printGreen '=================================================='

	installList i3 polybar dmenu rofi
	# installList xautolock
	# installList lightdm

}

total=$(($total + 1))
installfileManager() {
	printGreen '======================================================='
	printGreen '=============================== installing file manager'
	printGreen '======================================================='

	installList ranger

}

total=$(($total + 2))
installImageTools() {
	printGreen '======================================================'
	printGreen '=============================== installing image tools'
	printGreen '======================================================'

	installList sxiv gimp
	# installList nsxiv
}

total=$(($total + 2))
installWallpaperTools() {
	printGreen '============================================================'
	printGreen '=============================== installing wallpaper setters'
	printGreen '============================================================'

	# installList nitrogen
	installList xloadimage feh
}

total=$(($total + 1))
installTerminals() {
	printGreen '==================================================='
	printGreen '=============================== installing terminal'
	printGreen '==================================================='

	# installList fish
	installList alacritty
}

total=$(($total + 2))
installBrowsers() {
	printGreen '==================================================='
	printGreen '=============================== installing browsers'
	printGreen '==================================================='

	# TODO: add chrome and brave sources to the apt
	# TODO: install tor browser
	# installList google-chrome brave-browser qutebrowser torbrowser-launcher
	installList chromium
	installList firefox-esr
}

total=$(($total + 1))
installMailClient() {
	printGreen '======================================================'
	printGreen '=============================== installing mail client'
	printGreen '======================================================'

	installList thunderbird
}

installTorrenClient() {
	# install dependencies for utorrent
	wget -O ~/Downloads/libssl.deb http://snapshot.debian.org/archive/debian/20110406T213352Z/pool/main/o/openssl098/libssl0.9.8_0.9.8o-7_i386.deb
	sudo apt install ~/Downloads/libssl.deb -y
	rm ~/Downloads/libssl.deb

	# installing utorren
	sudo wget -O /usr/src/utorrent.tar.gz http://download.utorrent.com/linux/utorrent-server-3.0-25053.tar.gz
	cd /usr/src
	sudo tar xvzf /usr/src/utorrent.tar.gz -C utorrent/
	sudo mv torrent-server* torrent
	sudo ln -s /usr/src/utorrent/utserver /usr/bin/utserver
	cd
}

# installPlexServer(){
#   echo deb https://downloads.plex.tv/repo/deb public main | sudo tee /etc/apt/sources.list.d/plexmediaserver.list
#   curl https://downloads.plex.tv/plex-keys/PlexSign.key | sudo apt-key add -
#   sudo apt update -y
#   sudo apt install plexmediaserver -y
# }

installJellyfinServer() {
	wget -O- https://repo.jellyfin.org/install-debuntu.sh | sudo bash
}

total=$(($total + 3))
installMysql() {
	printGreen '========================================================'
	printGreen '=============================== installing mysql-servser'
	printGreen '========================================================'

	printYellow "downloading+running mysql config.deb"
	wget -O mysql.deb https://dev.mysql.com/get/mysql-apt-config_0.8.22-1_all.deb
	sudo apt install mysql.deb -y
	rm mysql.deb

	printYellow "update sources"
	sudo apt update -y

	installList mysql-server -y

	updateProgress 2
}

total=$(($total + 5))
installKvm() {
	printGreen '===================================================='
	printGreen '=============================== installing kernel vm'
	printGreen '===================================================='

	### SHARED DEPENDENCIES
	installList qemu-system libvirt-daemon-system
	# these three come with virt-manager, if you go GUI route; if you want only CLI, uncomment them
	# installList libvirt-clients
	# installList qemu-utils
	# installList ovmf # for UEFI

	installList virt-manager # GUI manager
	installList virtinst     # CLI manager

	# unless you only install headless OSs, you want a viewer
	# or else you need to run the GUI manager then run the VM from there
	installList virt-viewer # viewer

	printYellow "adding user to libvirt and libvirt-qemu group"
	sudo usermod -aG libvirt,libvirt-qemu $USER # don't add space after ','

	updateProgress 1
}

total=$(($total + 1))
installLazyGit() {
	printGreen '=================================================='
	printGreen '=============================== installing lazygit'
	printGreen '=================================================='

	printYellow "installing lzygit"

	LAZYGIT_VERSION=$(curl -s "https://api.github.com/repos/jesseduffield/lazygit/releases/latest" | grep '"tag_name":' | sed -E 's/.*"v*([^"]+)".*/\1/')
	curl -sLo ~/Downloads/lazygit.tar.gz "https://github.com/jesseduffield/lazygit/releases/latest/download/lazygit_${LAZYGIT_VERSION}_Linux_x86_64.tar.gz"

	sudo tar -xvf ~/Downloads/lazygit.tar.gz -C /usr/local/bin lazygit

	updateProgress 1
}

total=$(($total + 4))
installZap() {
	printGreen '======================================================'
	printGreen '=============================== install zsh, zap'
	printGreen '======================================================'

	installList zsh zsh-autosuggestions zsh-syntax-highlighting

	printYellow "installing zap"
	sudo chsh -s /bin/zsh $(whoami) # this is going to take effect after re-login
	zsh <(curl -s https://raw.githubusercontent.com/zap-zsh/zap/master/install.zsh) --branch release-v1

	updateProgress 1
}

total=$(($total + 3))
installNode() {
	printGreen '===================================================='
	printGreen '=============================== installing nvm, node'
	printGreen '===================================================='

	printYellow "installing nvim"
	# install nvm
	curl https://raw.githubusercontent.com/creationix/nvm/master/install.sh | bash
	export NVM_DIR="$HOME/.nvm"
	[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"                   # This loads nvm
	[ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion" # This loads nvm bash_completion

	printYellow "installing node"
	nvm install node

	printYellow "installing pnpm"
	npm i -g pnpm
	pnpm --force setup
	source ~/.zshrc
	source ~/.bashrc
	pnpm i -g pnpm

	updateProgress 3
}

total=$(($total + 4))
installNodePackages() {
	printGreen '========================================================'
	printGreen '=============================== installing node packages'
	printGreen '========================================================'

	printYellow "installing node packages"
	pnpm i -g nodemon pm2 prettier remark eslint typescript

	updateProgress 4
}

total=$(($total + 3))
installLunarVim() {
	printGreen '===================================================='
	printGreen '=============================== installing Lunar Vim'
	printGreen '===================================================='

	printYellow "installing lunarvim dependencies"
	npm i -g tree-sitter-cli neovim
	installList python3 python3-pip

	printYellow "installing neovim as another dependency"
	cd Downloads
	wget -O nvim.appimage https://github.com/neovim/neovim/releases/latest/download/nvim.appimage
	chmod u+x nvim.appimage
	./nvim.appimage --appimage-extract
	cp squashfs-root/usr/bin/nvim ~/.local/bin/nvim
	cd ~

	printYellow "installing LunarVim"
	yes | LV_BRANCH='release-1.3/neovim-0.9' bash <(curl -s https://raw.githubusercontent.com/LunarVim/LunarVim/release-1.3/neovim-0.9/utils/installer/install.sh)

	updateProgress 3
}

total=$(($total + 10))
syncDotFiles() {
	printGreen '====================================================='
	printGreen '=============================== syncronizing dotfiles'
	printGreen '====================================================='

	# cloning dotfiles repo
	printYellow "clonining dotfiles repo"
	if [[ -d ~/.dotfiles ]]; then
		read -p ".dotfiles already exists, are you sure you want to override it [y/N]: " choice
		if [[ ! $choice = "y" ]]; then
			exit 0
		fi
		rm -rf ~/.dotfiles
	fi

	# git clone --bare  https://github.com/segfaulty1/dotfiles.git ~/.dotfiles
	git clone --bare git@192.168.1.115:/media/D/bkp/bkpRepos/.dotfiles.git ~/.dotfiles
	git --git-dir=$HOME/.dotfiles/ --work-tree=$HOME remote add origin https://github.com/segfaulty1/dotfiles.git
	git --git-dir=$HOME/.dotfiles/ --work-tree=$HOME remote add localorigin git@core2.home:/media/D/bkp/bkpRepos/.dotfiles.git

	printYellow "backup existing dotfiles"
	mkdir -p .dotfiles-backup

	printYellow "checkout the repo"
	git --git-dir=$HOME/.dotfiles/ --work-tree=$HOME checkout
	if [ $? = 0 ]; then
		echo "Checked out config successfully."
	else
		echo "Backing up pre-existing dot files, to not ovverride them."
		git --git-dir=$HOME/.dotfiles/ --work-tree=$HOME checkout 2>&1 | egrep "\s+\." | awk {'print $1'} | xargs -I{} mv {} .dotfiles-backup/{}
		# git-checkout dotfiles for the repo
		git --git-dir=$HOME/.dotfiles/ --work-tree=$HOME checkout -f
	fi

	printYellow "hide untracked files"
	git --git-dir=$HOME/.dotfiles/ --work-tree=$HOME config --local status.showUntrackedFiles no

	updateProgress 10
}

total=$(($total + 10))
syncHomeFs() {
	printGreen '===================================================='
	printGreen '=============================== syncronizing home fs'
	printGreen '===================================================='

	printYellow "downloading user's data from the bkp server"

	# checking if host is up
	ping -c 1 "$bkpHost"
	if [[ $? = 0 ]]; then
		echo "Host ${bkpHost} is up"

		# checking if ssh server is up
		ssh "$bkpHost" "echo 'ssh port is open'"
		if [[ $? = 0 ]]; then
			# backup .keys and passwords
			saneRsync "${dest}/.ssh" "${dest}/.gnupg" "${dest}/.password-store" ~/

			# backup discord data
			saneRsync "${dest}/.config/discord" ~/.config/
			# backup chromium data
			saneRsync "${dest}/.config/chromium/Default" ~/.config/chromium/
			saneRsync "${dest}/.config/BraveSoftware/Brave-Browser/Defaul" ~/.config/BraveSoftware/Brave-Browser/

			# backup ~/home
			saneRsync "${dest}/home/books" "${dest}/home/bookmarks" "${dest}/home/non-dev" "${dest}/home/notes" "${dest}/home/scripts" "${dest}/home/trackit" ~/home/

			# backup git repos in ~/home
			saneRsync "${dest}/home/dev" "${dest}/home/wallpapers" ~/home
		fi
	fi

	updateProgress 10
}

total=$(($total + 1))
removeUnnecessaryDirs() {
	printGreen '========================================================='
	printGreen '=============================== remove the "unnecessary" '
	printGreen '========================================================='

	printYellow "removing dirs like Music and disabling some default daemons"

	rm -rf Public Videos Templates Pictures Music Documents Desktop

	# # console, only neede when changing the console's font, etc.
	# sudo systemctl disable console-setup.service
	# # who still uses modem anyways
	# sudo systemctl disable ModemManager.service

	updateProgress 1
}

setTimeZone() {
	printGreen '================================================='
	printGreen '=============================== setting timezone '
	printGreen '================================================='

	sudo timedatectl set-timezone Africa/Casablanca
}

main() {
	updatePackages
	installNala
	installBluetoothTools
	installNetStuff
	installBuildEssentials
	installX11Utils
	installMiscTools
	installDiskTools
	installDocumentReaders
	installDocker
	installFireJail
	installAudioTools
	installNotificationTools
	installDesktop
	installfileManager
	installTerminals
	installBrowsers
	installMailClient
	installLazyGit
	installKvm
	installZap
	installImageTo
	installWallpaperTo
	installNode
	installLunarVim
	syncDotFiles
	# syncHomeFs
	removeUnnecessaryDirs
}
main

printYellow "\n>> check the notInstalledList file for a list of apps that has failed to get installed."

sudo reboot

### post installation
# TODO: add aliases and functions to shell config as you install them

# TODO: add core2 to /etc/hosts

# TODO: edit grub
# TODO: clean apt sources
# TODO: disable password for reboot and shutdown
# TODO: add Xorg config files to /etc/X11/xorg.conf.d/

# TODO: avoid typing password when changing the default shell
