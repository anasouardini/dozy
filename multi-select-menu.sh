#!/bin/bash

key_input() {
  local key
  IFS= read -rsn1 key 2>/dev/null >&2
  if [[ $key = ""      ]]; then printf enter; fi;
  if [[ $key = $'\x20' ]]; then printf space; fi;
  if [[ $key = "k" ]]; then printf up; fi;
  if [[ $key = "j" ]]; then printf down; fi;
  if [[ $key = $'\x1b' ]]; then
      read -rsn2 key
      if [[ $key = [A || $key = k ]]]; then printf up;    fi;
      if [[ $key = [B || $key = j ]]]; then printf down;  fi;
  fi 
}

multiselect() {
    # little helpers for terminal print control and key input
    ESC=$( printf "\033")
    cursor_blink_on()   { printf "$ESC[?25h"; }
    cursor_blink_off()  { printf "$ESC[?25l"; }
    cursor_to()         { printf "$ESC[$1;${2:-1}H"; }
    print_inactive()    { printf "$2   $1 "; }
    print_active()      { printf "$2  $ESC[7m $1 $ESC[27m"; }
    get_cursor_row()    { IFS=';' read -sdR -p $'\E[6n' ROW COL; printf ${ROW#*[}; }

    local return_value=$1
    local -n options=$2
    local -n defaults=$3

    local selected=()
    for option in "${options[@]}"; do
      exists=0
      for e in "${defaults[@]}"; do 
        if [[ "$e" == "$option" ]]
          then
            exists=1
        fi
      done

      if [[ $exists == 1 ]]
        then
          selected+=('true') 
        else
          selected+=('false')
      fi
      printf "\n"
    done

    # determine current screen position for overwriting the options
    local lastrow=`get_cursor_row`
    local startrow=$(($lastrow - ${#options[@]}))

    # ensure cursor and input echoing back on upon a ctrl+c during read -s
    trap "cursor_blink_on; stty printf; printf '\n'; exit" 2
    cursor_blink_off

    toggle_option() {
      local option=$1
      if [[ ${selected[option]} == true ]]; then
          selected[option]=false
      else
          selected[option]=true
      fi
    }

    print_options() {
      # print options by overwriting the last lines
      local idx=0
      for option in "${options[@]}"; do
        local prefix="[ ]"
        if [[ ${selected[idx]} == true ]]; then
          prefix="[\e[38;5;46m✔\e[0m]"
        fi

        cursor_to $(($startrow + $idx))
        if [ $idx -eq $1 ]; then
            print_active "$option" "$prefix"
        else
            print_inactive "$option" "$prefix"
        fi
        ((idx++))
      done
    }

    local active=0
    while true; do
      print_options $active

      # user key control
      case `key_input` in
        space)  toggle_option $active;;
        enter)  print_options -1; break;;
        up)     ((active--));
                if [ $active -lt 0 ]; then active=$((${#options[@]} - 1)); fi;;
        down)   ((active++));
                if [ $active -ge ${#options[@]} ]; then active=0; fi;;
      esac
    done

    # cursor position back to normal
    cursor_to $lastrow
    printf "\n"
    cursor_blink_on

    local selectedList=()
    show_options() {
      # print options by overwriting the last lines
      local idx=0
      for option in "${options[@]}"; do
          if [[ ${selected[idx]} == true ]]; then
            selectedList+=($option)
          fi
          ((idx++))
      done
    }
    show_options

    eval $return_value+='("${selectedList[@]}")'
}

#======== Using the function goes like this

printf 'Pick a list item:'
myPackages=( 
    "i3"
    "polybar"
    "dmenu"
)
preselection=( "polybar" )
multiselect result myPackages preselection

for package in "${result[@]}"; do
  printf 'installing %s\n' $package
done

