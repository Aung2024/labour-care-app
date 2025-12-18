# Long Polling Fix for iOS/Network Issues

## Problem
Firestore uses WebSockets by default, which are often blocked by:
- Firewalls
- Proxies
- ISPs (especially in restrictive regions)
- Corporate networks

This causes connection failures even when HTTPS works fine.

## Solution
Force Firestore to use HTTPS long-polling instead of WebSockets.

### What Changed
Added `experimentalForceLongPolling: true` to Firestore settings in `js/firebase.js`.

### Why This Works
- **WebSockets**: Use a special protocol that many firewalls block
- **Long Polling**: Uses standard HTTPS requests, which are rarely blocked
- **More Reliable**: Works through most proxies and firewalls
- **Slightly Slower**: But much more reliable in restrictive networks

### Technical Details
```javascript
db.settings({
  experimentalForceLongPolling: true,
  cacheSizeBytes: firebase.firestore.CACHE_SIZE_UNLIMITED
});
```

This setting:
- Must be called BEFORE `enablePersistence()`
- Must be called BEFORE any Firestore operations
- Only needs to be set once per app initialization

### Expected Results
✅ Works through firewalls that block WebSockets  
✅ Works on restrictive networks  
✅ More reliable on iOS Safari  
✅ Works better with VPNs  
✅ Consistent connection behavior  

### Testing
1. Clear browser cache
2. Reload app
3. Check console for: "✅ Firestore configured with long polling"
4. Test patient loading - should work more reliably

### If Still Not Working
1. Check console for errors
2. Try different network (WiFi vs mobile data)
3. Use Safari Web Inspector to see network requests
4. Check if long polling is actually being used (should see HTTPS requests, not WebSocket connections)

