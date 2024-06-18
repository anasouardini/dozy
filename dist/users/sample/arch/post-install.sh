function paci(){
	sudo pacman -S $@ --noconfirm
}

cd;

# display
paci intel-ucode x86-video-intel xf86-video-vesa xf86-video-amdgpu xf86-video-ati xf86-video-nouveau;

# network setup
paci networkmanager network-manager-applet;
sudo systemctl enable NetworkManager;

# WM desktop setup
# paci xorg xorg-xinit i3-wm;
# echo 'exec i3' >> .xinitrc;
# cat << EOF | tee -a .bash_profile
# if [[ \$(tty) == "/dev/tty1" ]]; then
# 	pgrep i3 || startx &
# fi
# EOF

# DE desktop setup
paci xorg plasma sddm alacritty packgekit-qt5 chromium;
sudo systemctl enable sddm

# basic tools
paci rsync vim neovim;

# AUR tools
paci base-devel yay git;