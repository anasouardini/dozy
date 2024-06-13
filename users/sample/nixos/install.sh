#!/usr/bin/env bash

## config
bootType="uefi"; # uefi/bios

lsblk
read -p "Insert the name of your disk (sda, sdb, etc):" DISK
if [[ -z $DISK ]]; then
    echo "Can't leave the name emtpy!"
    exit 1
fi
DISK="/dev/$DISK"

echo "\n=================== Partitioning\n"
if [[ $bootType == "uefi" ]]; then
    parted "$DISK" -- mklabel gpt
    parted "$DISK" -- mkpart root ext4 512MB -12GB
    parted "$DISK" -- mkpart swap linux-swap -12GB 100%
    parted "$DISK" -- mkpart ESP fat32 1MiB 512MiB
    parted "$DISK" -- set 3 esp on
else
    parted "$DISK" -- mklabel msdos
    parted "$DISK" -- mkpart primary ext4 1MB -12GB
    parted "$DISK" -- set 1 boot on
    parted "$DISK" -- mkpart primary linux-swap -12GB 100%
fi

echo "\n=================== Formatting\n"
mkfs.ext4 -L nixos "${DISK}1"
mkswap -L swap "${DISK}2"
if [[ $bootType == "uefi" ]]; then
    mkfs.fat -F 32 -n boot "${DISK}3"
fi

echo "\n=================== Installing\n"
mount /dev/disk/by-label/nixos /mnt
if [[ $bootType == "uefi" ]]; then
    mkdir -p /mnt/boot
    # mount /dev/disk/by-label/boot /mnt/boot
    mount -o umask=077 /dev/disk/by-label/boot /mnt/boot
fi
swapon "${DISK}${NAME_DIVIDER}2"

echo "\n=================== Generating config files\n"
sudo nixos-generate-config --root /mnt

echo "\n=================== final steps\n"
if [[ ! $bootType == "uefi" ]]; then
    ## set `boot.loader.grub.device = true`
fi
nixos-install --no-root-passwd

# echo "\n=================== Preparing the chroot environment\n"
# sudo mount --bind /proc /mnt/proc
# sudo mount --bind /dev /mnt/dev
# sudo mount --bind /sys /mnt/sys
# sudo cp /etc/resolv.conf /mnt/etc/resolv.conf # dns might not be sat correctly (it's a common problem)
# chroot /mnt /nix/var/nix/profiles/system/activate
# chroot /mnt /run/current-system/sw/bin/bash
## todo: run in chroot
## passwd
## adduser venego