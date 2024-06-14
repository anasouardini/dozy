#!/usr/bin/env bash

## config
bootType="bios"; # uefi/bios
bootMenuType="grub"; # grub/systemd-boot
configurationPath="/mnt/etc/nixos/configuration.nix";

cd; # just in case
setfont ter-v22n;

lsblk -o name,serial,mountpoint,size,label,model
read -p "Insert the name of your disk (sda, sdb, vda, etc):" DISK
if [[ -z $DISK ]]; then
    printf "Can't leave the name emtpy!"
    exit 1
fi
DISK="/dev/$DISK"

printf "\n=================== Partitioning\n"
if [[ $bootType == "uefi" ]]; then
    sudo parted "$DISK" -- mklabel gpt
    sudo parted "$DISK" -- mkpart root ext4 512MiB 100%
    sudo parted "$DISK" -- mkpart ESP fat32 1MiB 512MiB
    sudo parted "$DISK" -- set 2 esp on
else
    sudo parted "$DISK" -- mklabel msdos
    sudo parted "$DISK" -- mkpart primary ext4 1MiB 100%
    sudo parted "$DISK" -- set 1 boot on
fi

printf "\n=================== Formatting\n"
sudo mkfs.ext4 -L root "${DISK}1"
# sudo mkswap -L swap "${DISK}3"
# sudo swapon "${DISK}${NAME_DIVIDER}2"
if [[ $bootType == "uefi" ]]; then
    sudo mkfs.fat -F 32 -n boot "${DISK}3"
fi

printf "\n=================== Mounting\n"
sudo mount /dev/disk/by-label/root /mnt
if [[ $bootType == "uefi" ]]; then
    sudo mount --mkdir -o umask=077 /dev/disk/by-label/boot /mnt/boot
fi

printf "\n=================== Setting up a swap file\n"
sudo touch /mnt/.swapfile
sudo dd if=/dev/zero of=/mnt/.swapfile bs=1M count=8192 # 8 GiB
sudo chmod 600 /mnt/.swapfile
sudo mkswap /mnt/.swapfile
sudo swapon /mnt/.swapfile # using swapfile in the live ISO just in case

printf "\n=================== Pacstraping\n"
pacstrap -K /mnt base linux linux-firmware intel-ucode base-devil grub ## installing the kernel and bassic tools
genfstab -U /mnt >> /mnt/etc/fstab # add /mnt to fstab by UUID
cat /mnt/etc/fstab

printf "\n=================== Chrooting\n"
sudo mount --bind /proc /mnt/proc
sudo mount --bind /dev /mnt/dev
sudo mount --bind /sys /mnt/sys
sudo cp /etc/resolv.conf /mnt/etc/resolv.conf # dns might not be sat correctly (it's a common problem)

cat << EOF | sudo chroot /mnt /usr/bin/bash
ln -sf /usr/share/zoneinfo/Africa/Casablanca /etc/localtime
hwclock --systohc
timedatectl set-ntp true

echo "en_US.UTF-8 UTF-8" >> /etc/locale.gen
locale-gen
echo "LANG=en_US.UTF-8" > /etc/locale.conf
echo "KEYMAP=us" > /etc/vconsole.conf

loadkeys us
echo "i5" > /etc/hostname

adduser -mG wheel,sudo,power,users,netdev,video,audio,libvirt,keyd,libvirt-qemu venego
echo "%wheel ALL=(ALL) ALL" >> /etc/sudoers
echo "%sudo ALL=(ALL) ALL" >> /etc/sudoers
echo "%venego ALL=(ALL) NOPASSWD: /sbin/reboot, /sbin/shutdown, /sbin/poweroff, /usr/bin/chvt" >> /etc/sudoers

su venego
# TODO: run post-installation script
# pacman -Syu
# pacman -S --noconfirm neovim
grub-install /dev/${DISK}
grub-mkconfig -o /boot/grub/grub.cfg /dev/${DISK}
exit
passwd root
passwd venego
EOF

umount -R /mnt
# reboot