#!/usr/bin/env bash

lsblk
read -p "Insert the name of your disk (sda, sdb, etc):" DISK
if [[ -z $DISK ]]; then
    echo "Can't leave the name emtpy!"
    exit 1
fi
DISK="/dev/$DISK"

echo "==================="
echo "Partitioning..."

sudo parted "$DISK" -- mklabel gpt
sudo parted "$DISK" -- mkpart ESP fat32 1MiB 512MiB
sudo parted "$DISK" -- set 3 boot on
sudo parted "$DISK" -- mkpart primary 512MiB -12GiB
sudo parted "$DISK" -- mkpart primary linux-swap -12GiB 100%

echo "==================="
echo "Formatting..."

sduo mkfs.fat -F 32 -n boot "${DISK}1"
sduo mkfs.ext4 -L nixos "${DISK}2"
sduo mkswap -L swap "${DISK}3"


echo "==================="
echo "Installing..."

sudo mount /dev/disk/by-label/nixos /mnt
sudo mkdir -p /mnt/boot
sudo mount /dev/disk/by-label/boot /mnt/boot
sudo swapon "${DISK}${NAME_DIVIDER}3"

echo "==================="
echo "Generating config files..."

sudo nixos-generate-config --root /mnt