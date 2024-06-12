#!/usr/bin/env bash

lsblk
read -p "Insert the name of your disk (sda, sdb, etc):" DISK
if [[ -z $DISK ]]; then
    echo "Can't leave the name emtpy!"
    exit 1
fi
DISK="/dev/$DISK"

echo "\n=================== Partitioning\n"
sudo parted "$DISK" -- mklabel gpt
sudo parted "$DISK" -- mkpart ESP fat32 1MiB 512MiB
sudo parted "$DISK" -- set 3 boot on
sudo parted "$DISK" -- mkpart primary 512MiB -12GiB
sudo parted "$DISK" -- mkpart primary linux-swap -12GiB 100%

echo "\n=================== Formatting\n"
sudo mkfs.fat -F 32 -n boot "${DISK}1"
sudo mkfs.ext4 -L nixos "${DISK}2"
sudo mkswap -L swap "${DISK}3"

echo "\n=================== Installing\n"
sudo mount /dev/disk/by-label/nixos /mnt
sudo mkdir -p /mnt/boot
sudo mount /dev/disk/by-label/boot /mnt/boot
sudo swapon "${DISK}${NAME_DIVIDER}3"

echo "\n=================== Generating config files\n"
sudo nixos-generate-config --root /mnt

echo "\n=================== Preparing the chroot environment\n"
sudo mount --bind /proc /mnt/proc
sudo mount --bind /dev /mnt/dev
sudo mount --bind /sys /mnt/sys
sudo cp /etc/resolv.conf /mnt/etc/resolv.conf # dns might not be sat correctly (it's a common problem)
chroot /mnt /nix/var/nix/profiles/system/activate
chroot /mnt /run/current-system/sw/bin/bash