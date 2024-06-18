#!/bin/bash

os="debian";
osVersion=$(cat /proc/version);
if [[ osVersion == *"arch"* ]];then
  os="archlinux";
elif [[ osVersion == *"debian"* ]];then
  os="debian";
fi

host="https://dozy.netlify.app";

githubUsername='anasouardini';
shift;
installerArgs=$@;

# make sure curl is there
command -v curl > /dev/null 2>&1;
if [ ! $? -eq 0 ]; then
  echo "installing curl";
  if [[ os == *"archlinux"* ]];then
    sudo pacman -S curl --noconfirm
  elif [[ os == *"debian"* ]];then
    sudo apt install curl -y
  fi
fi

#-------- install deno
# deno needs unzip to install itself
command -v unzip > /dev/null 2>&1;
if [ ! $? -eq 0 ]; then
  echo "installing unzip";
  if [[ os == *"archlinux"* ]];then
    sudo pacman -S unzip --noconfirm
  elif [[ os == *"debian"* ]];then
    sudo apt install unzip -y
  fi
fi

ls $HOME/.deno/bin/deno > /dev/null 2>&1;
if [ ! $? -eq 0 ]; then
  echo "running the deno installer";
  curl -fsSL https://deno.land/x/install/install.sh | sh
  export PATH="$PATH:$HOME/.deno/bin/"
fi

#------------ run the installer TS script
echo "download post-installation script";
installerPath="./${githubUsername}-installer.ts";
if [ -f $installerPath ]; then
  echo "The file: '${installerPath}' is going to be removed.";
  read -p "Ctrl+C to cancel or Enter to continue: " dummy;
  rm -rf $installerPath;
fi

echo "running the post-installation script";
type unzip > /dev/null 2>&1;
if [ ! $? -eq 0 ]; then
  echo "installing unzip...";
  sudo pacman -S unzip --noconfirm
fi
echo "fetching [${host}/users/${githubUsername}/arch/installer.ts)";
curl -fsSL "${host}/users/${githubUsername}/arch/installer.ts" -o $installerPath;
echo "running the post-installation with args: [${installerArgs}]";
$HOME/.deno/bin/deno run --allow-all $installerPath $installerArgs;
