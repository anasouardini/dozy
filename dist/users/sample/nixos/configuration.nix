{ config, pkgs, ... }:

{
  imports =
    [
      ./hardware-configuration.nix
    ];

  # Bootloader.
  boot.loader.grub.enable = true;
  boot.loader.grub.useOSProber = true;
  ## GRUB dynamic configuration

  networking.hostName = "vm";

  # Enable networking
  networking.networkmanager.enable = true;
  networking.wireless.enable = true;

  time.timeZone = "Africa/Casablanca";
  i18n.defaultLocale = "en_US.UTF-8";
  i18n.extraLocaleSettings = {
    LC_ADDRESS = "ar_MA.UTF-8";
    LC_IDENTIFICATION = "ar_MA.UTF-8";
    LC_MEASUREMENT = "ar_MA.UTF-8";
    LC_MONETARY = "ar_MA.UTF-8";
    LC_NAME = "ar_MA.UTF-8";
    LC_NUMERIC = "ar_MA.UTF-8";
    LC_PAPER = "ar_MA.UTF-8";
    LC_TELEPHONE = "ar_MA.UTF-8";
    LC_TIME = "ar_MA.UTF-8";
  };
  # Configure keymap in X11
  services.xserver = {
    layout = "us";
    xkbVariant = "";
  };

  # Define a user account.
  users.users.venego = {
    isNormalUser = true;
    description = "ven ego";
    extraGroups = [
      "networkmanager"
      "wheel"
      "audio"
      "sound"
      "video"
    ];
    shell = pkgs.zsh;
    initialPassword = "venego";
    packages = with pkgs; [
      neovim
    ];
  };

  system.stateVersion = "24.05";
}
