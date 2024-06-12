#!/run/current-system/sw/bin/bash

read -p "Insert the name of your disk (sda, sdb, etc):" $DISK
if [[ -z $DISK ]]; then
    echo "Can't leave the name emtpy!"
    lsblk
    exit 1
fi

echo "==================="
echo "Partitioning..."

parted "$DISK" -- mklabel gpt
parted "$DISK" -- mkpart ESP fat32 1MiB 512MiB
parted "$DISK" -- set 3 boot on
parted "$DISK" -- mkpart primary 512MiB -12GiB
parted "$DISK" -- mkpart primary linux-swap -12GiB 100%

echo "==================="
echo "Formatting..."

mkfs.fat -F 32 -n boot "${DISK}1"
mkfs.ext4 -L nixos "${DISK}2"
mkswap -L swap "${DISK}3"


echo "==================="
echo "Installing..."

mount /dev/disk/by-label/nixos /mnt
mkdir -p /mnt/boot
mount /dev/disk/by-label/boot /mnt/boot
swapon "${DISK}${NAME_DIVIDER}3"

echo "==================="
echo "Generating config files..."

nixos-generate-config --root /mnt