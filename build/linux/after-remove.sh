#!/bin/bash
# Post-removal script for FlowMind (Debian/Ubuntu)

# Update desktop database
if [ -x "$(command -v update-desktop-database)" ]; then
    update-desktop-database -q
fi

# Update icon cache
if [ -x "$(command -v gtk-update-icon-cache)" ]; then
    gtk-update-icon-cache -q -t -f /usr/share/icons/hicolor
fi

exit 0
