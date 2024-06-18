## Dozy - (Automation Scripts)

My collections of Linux automation scripts, I'd appreaciate it if you share your cool scripts in this repo.

### usage

```bash
sh <(curl -fsSL "https://dozy.netlify.app/users/sample/debian/install.sh")
```

That will only run a sample script for a quick demo:

- `sample` represents the username.
- `debian` is just a directory that could have any name (e.g: debian-dekstop, debian-server, gaming-setup)
- `dropper.sh` is just a script that you fetch and run in the terminal session

feel free to add your own directory with installation script(s) to this repository.

You can, as well, pass any arguments to your script

```bash
sh <(curl -fsSL "https://dozy.netlify.app/users/sample/debian/install.sh") run check-env etc
```

### NixOS installer

```bash
sh <(curl -fsSL "https://dozy.netlify.app/users/sample/nixos/install.sh")
```

NixOS makes it harder for the configuration.nix to be versatile, you might need to tweak it a bit.

### Arch installer

```bash
sh <(curl -sfSL "https://dozy.netlify.app/users/sample/arch/install.sh")
```


### FS Tree (Users List)
```bash
---- Users Tree

```
