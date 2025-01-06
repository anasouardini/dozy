#!/bin/bash

host="https://dozy.netlify.app";

githubUsername='anasouardini';
installerArgs=$@;

function installIfDoesnNotExist(){
  command -v "$1" > /dev/null 2>&1;
  if [ ! $? -eq 0 ]; then
    echo "installing ${1}...";
    sudo apt install $1 -y
  fi
}
installIfDoesnNotExist curl
installIfDoesnNotExist wget
installIfDoesnNotExist unzip # deno needs it

#-------- install deno
ls $HOME/.deno/bin/deno > /dev/null 2>&1;
if [ ! $? -eq 0 ]; then
  echo "running the deno installer";
  curl -fsSL https://deno.land/x/install/install.sh | sh
  echo 'PATH="$PATH:$HOME/.deno/bin/"' | tee -a .bashrc;
  export 'PATH="$PATH:$HOME/.deno/bin/"';
fi

#------------ run the installer (TS script)
echo "download post-installation script";
installerPath="./${githubUsername}-installer.ts";
if [ -f $installerPath ]; then
  echo "The file: '${installerPath}' is going to be removed.";
  read -p "\e[31mCtrl+C\e[0m to cancel or \e[32mEnter\e[0m to continue: " dummy;
  rm -rf $installerPath;
fi

curl -fsSL "${host}/users/${githubUsername}/debian/installer.ts" -o $installerPath;
echo "running the post-installation script";
$HOME/.deno/bin/deno run --allow-all $installerPath $installerArgs;
