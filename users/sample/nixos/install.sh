#!/usr/bin/env bash

## config
bootType="bios"; # uefi/bios
bootMenuType="grub"; # grub/systemd-boot
configurationPath="/mnt/etc/nixos/configuration.nix";

setfont ter-v22n

lsblk
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
sudo mkfs.ext4 -L nixos "${DISK}1"
# sudo mkswap -L swap "${DISK}3"
# sudo swapon "${DISK}${NAME_DIVIDER}2"
if [[ $bootType == "uefi" ]]; then
    sudo mkfs.fat -F 32 -n boot "${DISK}3"
fi

printf "\n=================== Mounting\n"
sudo mount /dev/disk/by-label/nixos /mnt
if [[ $bootType == "uefi" ]]; then
    sudo mkdir -p /mnt/boot
    sudo mount -o umask=077 /dev/disk/by-label/boot /mnt/boot
fi

printf "\n=================== Making a swap file\n"
sudo touch /mnt/.swapfile
sudo dd if=/dev/zero of=/mnt/.swapfile bs=1M count=8192
sudo chmod 600 /mnt/.swapfile
sudo mkswap /mnt/.swapfile
sudo swapon /mnt/.swapfile # using swapfile in the live ISO just in case

printf "\n=================== Generating config files\n"
sudo nixos-generate-config --root /mnt
sudo mv /mnt/etc/nixos/configuration.nix /mnt/etc/nixos/configuration.nix.bak
sudo curl -o /mnt/etc/nixos/configuration.nix https://postinstaller.netlify.app/users/sample/nixos/configuration.nix

printf "\n=================== Modifying config files\n"
if [[ $bootType == "uefi" ]]; then
    if [[ $bootMenuType == "grub" ]]; then
        sed -i 's/## GRUB dynamic configuration/## UEFI GRUB configuration\n  boot.loader.grub.device = "nodev";\n  boot.loader.grub.efiSupport = true;/' $configurationPath;
    else
        sed -i 's/## GRUB dynamic configuration/## UEFI systemd-boot configuration\n  boot.loader.systemd-boot.enable = true;/' $configurationPath;
    fi
else
    sed -i 's/## GRUB dynamic configuration/## BIOS GRUB configuration\n  boot.loader.grub.device = "\/dev\/vda";\n  boot.loader.grub.useOSProber = true;/' $configurationPath;
fi

printf "\n=================== Installing\n"
sudo nixos-install
# it'll ask for setting the root password. (--no-root-passwd) doesn't work
# it'll unmount the /mnt (root filesystem)

# Might not be needed since most things can be done by
# just dropping a config file to the target disk ¯\_(ツ)_/¯
# printf "\n=================== Preparing the chroot environment\n"
# sudo mount /dev/disk/by-label/nixos /mnt
# if [[ $bootType == "uefi" ]]; then
#     sudo mkdir -p /mnt/boot
#     sudo mount -o umask=077 /dev/disk/by-label/boot /mnt/boot
# fi
# sudo mount --bind /proc /mnt/proc
# sudo mount --bind /dev /mnt/dev
# sudo mount --bind /sys /mnt/sys
# sudo cp /etc/resolv.conf /mnt/etc/resolv.conf # dns might not be sat correctly (it's a common problem)
# chroot /mnt /nix/var/nix/profiles/system/activate
# chroot /mnt /run/current-system/sw/bin/bash