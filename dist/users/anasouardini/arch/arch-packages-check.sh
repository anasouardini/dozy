#!/bin/bash

apps="rsync nala bluez bluez-tools pulseaudio-module-bluetooth pipewire pipewire-pulse network-manager wget curl arp-scan sshfs netplan.io proftpd hping3 build-essential libx11-dev gcc make cmake xorg xinput arandr xdo xdotool xclip xbanish git vlc yt-dlp flameshot simplescreenrecorder zathura zathura-pdf-poppler mpd ncmpcpp mpc sxiv gimp ripgrep btop fd-find ncdu bat tldr rsync bc tree trash-cli rename whois fzf dosfstools gdisk lvm2 smartmontools timeshift adb fastboot docker.io docker-compose qemu-system libvirt-daemon-system libvirt-clients qemu-utils ovmf virtinst virt-manager virt-viewer firejail ufw tor proxychains pass pinentry-qt policykit-1-gnome dbus-x11 notification-daemon libnotify-bin dunst pulseaudio alsa-utils pavucontrol i3 polybar suckless-tools sxhkd ranger alacritty chromium brave-browser google-chrome-stable thunderbird myql sqlite3 lazyvim (nvm) code plexmediaserver zsh zsh-autosuggestions zsh-syntax-highlighting"

echo "---------- APPS that don't exist in arch mirros:"
for app in $apps; do
    exists=$(sudo pacman -Ssq $app | grep "$app");

    if [[ -z $exists ]]; then
        exists=$(sudo yay -Ssq $app | grep "$app");
        if [[ -z $exists ]]; then
            echo $app
        fi
    fi
done