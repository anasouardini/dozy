cd;

sudo pacman -S xorg xorg-xinit i3-wm networkmanager --noconfirm;
sudo systemctl enable NetworkManager;

echo 'exec i3' >> .xinitrc;
cat << EOF | tee -a .bash_profile
 
if [[ $(tty) == "/dev/tty1" ]]; then
	pgrep i3 || startx &
fi
EOF