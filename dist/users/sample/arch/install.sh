#!/usr/bin/env bash

## config
bootType="bios"; # uefi/bios
if [[ -d /sys/firmware/efi ]];then
    bootType="uefi"; # uefi/bios
else

username="venego";
initialPassword="venego";
hostname="i5";

cd; # just in case
setfont ter-v22n;

lsblk -o name,serial,mountpoint,size,label,model
read -p "Insert the name of your disk (sda, sdb, vda, etc):" DISK
if [[ -z $DISK ]]; then
    printf "Can't leave the name emtpy!"
    exit 1
fi
DISK="/dev/$DISK"

mounted=$(mount | grep "${DISK}")
if [[ -n $mounted ]]; then
    printf "\n=================== Disk Is Mounted; Unmounting\n"
    sudo umount -R /mnt
fi

printf "\n=================== Partitioning\n"
## todo: find a better solution than piping "yes" output to `parted`
if [[ $bootType == "uefi" ]]; then
    yes yes | sudo parted "$DISK" -- mklabel gpt
    yes yes | sudo parted "$DISK" -- mkpart root ext4 512MiB 100%
    yes yes | sudo parted "$DISK" -- mkpart ESP fat32 1MiB 512MiB
    sudo parted "$DISK" -- set 2 esp on
else
    yes yes | sudo parted "$DISK" -- mklabel msdos
    yes yes | sudo parted "$DISK" -- mkpart primary ext4 2MiB 100%
    sudo parted "$DISK" -- set 1 boot on
fi

printf "\n=================== Formatting\n"
yes y | sudo mkfs.ext4 -L root "${DISK}1"
# sudo mkswap -L swap "${DISK}3"
# sudo swapon "${DISK}${NAME_DIVIDER}2"
if [[ $bootType == "uefi" ]]; then
    yes y | sudo mkfs.fat -F 32 -n boot "${DISK}3"
fi

printf "\n=================== Mounting\n"
sudo mount /dev/disk/by-label/root /mnt
if [[ $bootType == "uefi" ]]; then
    sudo mount --mkdir -o umask=077 /dev/disk/by-label/boot /mnt/boot/efi
fi
lsblk
mounted=$(mount | grep "${DISK}")
if [[ -z $mounted ]]; then
    echo "=> Err: drive not mounted, formatting or partitioning went wrong";
    exit 1;
fi

printf "\n=================== Setting up a swap file\n"
# sudo touch /mnt/.swapfile
# sudo dd if=/dev/zero of=/mnt/.swapfile bs=1M count=8192 # 8GiB
# sudo chmod 600 /mnt/.swapfile
# sudo mkswap /mnt/.swapfile
# sudo swapon /mnt/.swapfile # using swapfile in the live ISO just in case

printf "\n=================== Pacstraping\n"
pacman -Syyu --noconfirm
## installing the kernel and bassic tools
pacstrap -K /mnt base linux linux-firmware
genfstab -U /mnt >> /mnt/etc/fstab # add /mnt to fstab by UUID
cat /mnt/etc/fstab

printf "\n=================== Chrooting\n"
sudo cp /etc/resolv.conf /mnt/etc/resolv.conf # dns might not be sat correctly (it's a common problem)
cat << EOF | arch-chroot /mnt
yes root | passwd root

ln -sf /usr/share/zoneinfo/Africa/Casablanca /etc/localtime
hwclock --systohc
timedatectl set-ntp true

echo "en_US.UTF-8 UTF-8" >> /etc/locale.gen
locale-gen
echo "LANG=en_US.UTF-8" > /etc/locale.conf
echo "KEYMAP=us" > /etc/vconsole.conf

loadkeys us
echo "${hostname}" >> /etc/hostname
echo "127.0.0.1 localhost" >> /etc/hostname
echo "::1 localhost" >> /etc/hostname
echo "127.0.1.1 ${hostname}.localdomain ${hostname}" >> /etc/hostname

# groups: wheel,sudo,power,users,netdev,video,audio,libvirt,keyd,libvirt-qemu
useradd -mG wheel ${username}
yes ${initialPassword} | passwd ${username}
echo "%wheel ALL=(ALL) ALL" >> /etc/sudoers
# This is required in case you're running this script through ssh
echo "${username} ALL=(ALL:ALL) NOPASSWD: ALL" >> /etc/sudoers;

pacman -S grub;
if [[ $bootType == "uefi" ]]; then
    pacman -S efibootmgr;
    grub-install --target=x86_64-efi --efi-directory=/boot/efi --bootloader-id=GRUB ${DISK}
    # if usb add '--removable --recheck' before the disk name
else
    grub-install --target=i386-pc ${DISK}
fi
grub-mkconfig -o /boot/grub/grub.cfg ${DISK}

su ${username} -c "sh <(curl -sfSL https://postinstaller.netlify.app/users/sample/arch/post-install.sh)"
# removing wild permissions
sed -i '/ALL=(ALL:ALL) NOPASSWD: ALL$/d' >> /etc/sudoers
# convinient privileges
echo "${username} ALL=(ALL:ALL) NOPASSWD: /sbin/reboot, /sbin/shutdown, /sbin/poweroff, /usr/bin/chvt" >> /etc/sudoers
EOF

umount -R /mnt
reboot