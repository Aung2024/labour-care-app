#!/bin/bash

# Script to add session-manager.js and audit-logger.js to all HTML pages that have firebase.js
# but don't already have session-manager.js

echo "Adding session-manager.js to all pages with firebase.js..."

# Find all HTML files with firebase.js but without session-manager.js
for file in *.html; do
  if [ -f "$file" ]; then
    # Check if file has firebase.js but not session-manager.js
    if grep -q "js/firebase.js" "$file" && ! grep -q "js/session-manager.js" "$file"; then
      echo "Processing: $file"
      
      # Use sed to add session-manager.js and audit-logger.js after firebase.js
      # This is a simple approach - you may need to adjust based on your file structure
      sed -i.bak 's|<script src="js/firebase.js"></script>|<script src="js/firebase.js"></script>\n  <script src="js/session-manager.js"></script>\n  <script src="js/audit-logger.js"></script>|g' "$file"
      
      # Clean up backup files
      rm -f "$file.bak"
    fi
  fi
done

echo "Done! Please review the changes before committing."

