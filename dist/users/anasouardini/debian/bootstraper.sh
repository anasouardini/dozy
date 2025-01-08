#!/bin/bash

# TODO: device and post-installation script could be provided as arguments.

cd $(dirname $0)

printGreen() {
	printf '\033[1;32m> %s\033[0m\n' "$@" >&2 # bold Green
}
printRed() {
	printf '\033[1;31m> %s\033[0m\n' "$@" >&2 # bold Red
}

[[ $(whoami) = 'root' ]] || printRed "Err -> you have to run the script as root" && exit 1

mountPath=/mnt
mirror=http://ftp.es.debian.org/debian/
distribution=bookworm
arch=amd64
partTableType='msdos'

function first() {
	printGreen "Pick a usb device:"
	lsblk -dno name,size,type,mountpoint | awk '{print NR, ") ", $0}'

	echo ""
	read -p 'Device number: ' deviceNumber

	chosenDevice=$(lsblk -dno name,size,type,mountpoint | sed -n ${deviceNumber}p | awk '{print "/dev/" $1}')

	echo ""
	printGreen "Are you sure you want to format the device ${chosenDevice}? (y/N)"
	read -p "[n] : " isContinue
	if [[ ! $isContinue = "y" ]]; then
		exit 0
	fi

	# TODO: check where it's mounted, if to the desired path, leave it, if not unmount it
	mountedDev=$(mount | grep $chosenDevice)
	if [[ -n $mountedDev ]]; then
		printGreen "${chosenDevice} is already mounted; unmount it first"
		exit 1
	fi

	# TODO: make sure it's the chosen device that is mounted and then leave it mounted
	mountedPath=$(mount | grep $mountPath)
	if [[ -n $mountedPath ]]; then
		printGreen "${mountPath} is being used to mount some device; unmount it first"
		exit 1
	fi

	printGreen "Clearing partition table"
	# no need, dd will take care off partition table and potential GPT parition
	# yes | sgdisk --zap-all "$chosenDevice"

	printGreen "removing potential old GPT label; grub2 is stupid"
	# parted "$chosenDevice" --script mkpart primary ext4 0MB 1MB
	dd if=/dev/zero of=$chosenDevice bs=1M count=2
	# parted "$chosenDevice" --script rm 2

	printGreen "Partitioning and formatting"
	parted "$chosenDevice" --script mklabel "$partTableType"
	parted "$chosenDevice" --script mkpart primary ext4 1MB 100%
	parted "$chosenDevice" --script set 1 boot on
	yes | mkfs.ext4 -L 'ROOT' "${chosenDevice}1"

	mkdir -p $mountPath
	printGreen "Mounting ${chosenDevice}1 to ${mountPath}"
	mount "${chosenDevice}1" $mountPath

	# Install debootstrap if it's not already installed
	which debootstrap
	if [[ $? != 0 ]]; then
		echo "debootstrap not found. Installing..."
		apt-get update -y
		apt-get install debootstrap -y
	fi

	printGreen "debootstraping..."
	debootstrap --cache-dir=/home/venego/.debootstrap-cache --arch="$arch" "$distribution" "$mountPath" "$mirror"
}
first

printGreen "Setting up bindings"
mount --make-rslave --rbind /dev $mountPath/dev
mount --make-rslave --rbind /proc $mountPath/proc
mount --make-rslave --rbind /sys $mountPath/sys
mount --make-rslave --rbind /run $mountPath/run

printRed "--------- Changing rootfs to ${mountPath}"

# printGreen "Adding non-free and contrib repos"
# chroot $mountPath /bin/bash -c "echo 'deb http://ftp.es.debian.org/debian ${distribution} main contrib non-free-firmware' > /etc/apt/sources.list && apt update -y"
printGreen "Installing kernel and grub packages"
chroot $mountPath /bin/bash -c "apt install linux-image-amd64 firmware-linux-free network-manager grub2 -y"
printGreen "Installing grub"
chroot $mountPath /bin/bash -c "grub-install ${chosenDevice} && update-grub"
printGreen "Installing standard utils"
chroot $mountPath /bin/bash -c "tasksel insatll standard"
printGreen "setting password for root"
# literlly repeating the password twice using echo :)
chroot $mountPath /bin/bash -c "printf "root\nroot\n" | passwd root"

printGreen "Unounting ${chosenDevice}"
umount -R $mountPath

# printGreen "Booting ${chosenDevice} in Qemu"
# qemu-system-x85_64 -machine accel=kvm:tcg -m 512 -hda $chosenDevice
