# Domain Blocking Detection & Solutions

## Problem
Firebase domains may be blocked by:
- **Government firewalls** (especially in restrictive regions)
- **ISP-level blocking** (certain internet providers)
- **Corporate firewalls** (work/school networks)
- **DNS-level blocking** (DNS servers filtering domains)

## Firebase Domains Used

### Critical Domains (App won't work if blocked):
1. **`labourcare-2481a.firebaseapp.com`** - Firebase Authentication
2. **`firestore.googleapis.com`** - Firestore Database API
3. **`www.gstatic.com`** - Firebase SDK files

### Non-Critical Domains:
4. **`www.googleapis.com`** - Google APIs (some features)
5. **`labourcare-2481a.appspot.com`** - Storage (if used)

## Detection

The app now automatically tests domain connectivity. Check browser console for:
- ✅ `Domain accessible` - Domain is reachable
- ❌ `Domain blocked` - Domain is blocked

### Manual Test
Run in browser console:
```javascript
testFirebaseDomains().then(results => {
  console.table(results);
});
```

## Solutions

### 1. Change DNS Servers (Recommended)

**On iPhone:**
1. Settings → Wi-Fi
2. Tap (i) next to your WiFi network
3. Scroll to "DNS"
4. Change to:
   - **Google DNS**: `8.8.8.8` and `8.8.4.4`
   - **Cloudflare DNS**: `1.1.1.1` and `1.0.0.1`

**Why this works:**
- Government-controlled DNS may block Firebase domains
- Google/Cloudflare DNS bypasses local DNS filtering
- Often resolves domain blocking issues

### 2. Use VPN
- Routes traffic through different network path
- Bypasses local firewall/ISP blocks
- Most reliable solution for domain blocking

### 3. Use Mobile Data Instead of WiFi
- Mobile carriers may use different DNS
- Mobile data routing may bypass firewalls
- Often works when WiFi doesn't

### 4. Contact Network Administrator
If on corporate/school network:
- Ask to whitelist Firebase domains
- Request firewall rule changes
- Get VPN access

## How to Check Which Domains Are Blocked

### Method 1: Browser Console
```javascript
// Run domain test
testFirebaseDomains().then(results => {
  results.forEach(r => {
    if (!r.accessible) {
      console.error(`❌ ${r.name} (${r.url}) is BLOCKED`);
    } else {
      console.log(`✅ ${r.name} (${r.url}) is accessible (${r.latency}ms)`);
    }
  });
});
```

### Method 2: Safari Web Inspector (iPhone)
1. Connect iPhone to Mac via USB
2. On Mac: Safari → Develop → [Your iPhone] → [Your App]
3. Check Network tab for failed requests
4. Look for domains returning:
   - `ERR_NAME_NOT_RESOLVED` (DNS issue)
   - `ERR_CONNECTION_REFUSED` (Firewall block)
   - `ERR_TIMED_OUT` (Network block)

### Method 3: Terminal Test (Mac/Laptop)
```bash
# Test DNS resolution
nslookup labourcare-2481a.firebaseapp.com
nslookup firestore.googleapis.com

# Test connectivity
curl -I https://labourcare-2481a.firebaseapp.com
curl -I https://firestore.googleapis.com
```

## Expected Behavior

### If Domains Are Accessible:
✅ App loads normally  
✅ Patient data loads  
✅ No console errors about domains  

### If Domains Are Blocked:
❌ Console shows "DOMAIN BLOCKING DETECTED"  
❌ Patient data fails to load  
❌ Error messages mention domain issues  
✅ Cache may still work (shows old data)  

## Automatic Detection

The app now:
1. **Tests domains on startup** (non-blocking, runs in background)
2. **Logs blocked domains** to console
3. **Provides solutions** in error messages
4. **Falls back to cache** when domains are blocked

## DNS Configuration Examples

### Google DNS
- Primary: `8.8.8.8`
- Secondary: `8.8.4.4`

### Cloudflare DNS
- Primary: `1.1.1.1`
- Secondary: `1.0.0.1`

### OpenDNS
- Primary: `208.67.222.222`
- Secondary: `208.67.220.220`

## Testing After DNS Change

1. **Clear DNS cache:**
   - iPhone: Turn WiFi off/on
   - Or: Restart device

2. **Test domains:**
   ```javascript
   testFirebaseDomains()
   ```

3. **Try app again:**
   - Should load patient data
   - Check console for success messages

## Why This Happens

### Government Firewalls
- Some governments block Google services
- Firebase domains may be on blocklist
- VPN or DNS change bypasses this

### ISP-Level Blocking
- Internet providers may block certain domains
- Often for "security" or compliance
- DNS change often fixes this

### Corporate Firewalls
- Work/school networks block external services
- Firewall rules filter Firebase domains
- VPN or network admin help needed

## Combined with Long Polling Fix

The long polling fix (HTTPS instead of WebSockets) + domain detection work together:
- **Long polling**: Bypasses WebSocket blocks
- **Domain detection**: Identifies which domains are blocked
- **DNS change**: Fixes domain resolution issues
- **Cache fallback**: Keeps app working with old data

## Success Indicators

After applying fixes, you should see:
- ✅ Console: "Firestore configured with long polling"
- ✅ Console: All domains show as accessible
- ✅ Patient data loads successfully
- ✅ No domain blocking errors

