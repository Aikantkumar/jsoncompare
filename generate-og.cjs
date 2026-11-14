const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const svgContent = `<svg width="1200" height="630" viewBox="0 0 1200 630" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0a0b0e" />
      <stop offset="50%" stop-color="#121318" />
      <stop offset="100%" stop-color="#07080a" />
    </linearGradient>
    <linearGradient id="brandGrad" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#ffffff" />
      <stop offset="100%" stop-color="#b5b5b8" />
    </linearGradient>
    <filter id="cardShadow" x="-10%" y="-10%" width="120%" height="120%">
      <feDropShadow dx="0" dy="8" stdDeviation="16" flood-color="#000000" flood-opacity="0.6"/>
    </filter>
  </defs>

  <!-- Background -->
  <rect width="1200" height="630" fill="url(#bgGrad)" />

  <!-- Subtle grid pattern -->
  <g opacity="0.08" stroke="#ffffff" stroke-width="1">
    <path d="M 0,90 L 1200,90 M 0,180 L 1200,180 M 0,270 L 1200,270 M 0,360 L 1200,360 M 0,450 L 1200,450 M 0,540 L 1200,540" />
    <path d="M 120,0 L 120,630 M 240,0 L 240,630 M 360,0 L 360,630 M 480,0 L 480,630 M 600,0 L 600,630 M 720,0 L 720,630 M 840,0 L 840,630 M 960,0 L 960,630 M 1080,0 L 1080,630" />
  </g>

  <!-- Glow effect -->
  <circle cx="600" cy="180" r="320" fill="#3b82f6" opacity="0.05" filter="blur(80px)" />
  <circle cx="950" cy="380" r="240" fill="#10b981" opacity="0.04" filter="blur(80px)" />

  <!-- Outer Border Frame -->
  <rect x="30" y="30" width="1140" height="570" rx="20" fill="none" stroke="#22242a" stroke-width="1.5" />

  <!-- Header Category Badge -->
  <g transform="translate(70, 70)">
    <rect width="210" height="32" rx="16" fill="#16181d" stroke="#2b2d35" stroke-width="1" />
    <circle cx="16" cy="16" r="4.5" fill="#22c55e" />
    <text x="30" y="21" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" font-size="12" font-weight="700" fill="#b5b5b8" letter-spacing="1">JSON COMPARE TOOL</text>
  </g>

  <!-- Main Heading -->
  <text x="70" y="160" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" font-size="52" font-weight="900" fill="url(#brandGrad)" letter-spacing="-1">
    JSON Compare Online
  </text>
  <text x="70" y="210" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" font-size="24" font-weight="600" fill="#9ca3af">
    Semantic JSON Diff Engine, RFC 6902 Patch &amp; Local Privacy
  </text>

  <!-- Mock JSON Diff Box -->
  <g transform="translate(70, 245)" filter="url(#cardShadow)">
    <!-- Container background -->
    <rect width="1060" height="235" rx="14" fill="#12141a" stroke="#232630" stroke-width="1.5" />

    <!-- Top window title bar -->
    <rect width="1060" height="38" rx="14" fill="#181a22" />
    <path d="M 0,26 L 0,38 L 1060,38 L 1060,26 Z" fill="#181a22" />
    <line x1="0" y1="38" x2="1060" y2="38" stroke="#232630" stroke-width="1" />
    
    <!-- Dots -->
    <circle cx="24" cy="19" r="5" fill="#ef4444" opacity="0.8" />
    <circle cx="42" cy="19" r="5" fill="#f59e0b" opacity="0.8" />
    <circle cx="60" cy="19" r="5" fill="#10b981" opacity="0.8" />
    <text x="85" y="23" font-family="monospace" font-size="12" fill="#71717a">semantic-diff-preview.json (Side-by-Side Mode)</text>

    <!-- Left Editor (Original) -->
    <g transform="translate(25, 55)">
      <text x="0" y="0" font-family="monospace" font-size="11" fill="#71717a">ORIGINAL (Before)</text>
      <g font-family="monospace" font-size="13" fill="#e4e4e7">
        <text x="0" y="24"><tspan fill="#71717a">1 </tspan>&#123;</text>
        <text x="0" y="46"><tspan fill="#71717a">2 </tspan>  <tspan fill="#60a5fa">"service"</tspan>: <tspan fill="#34d399">"auth-api"</tspan>,</text>
        <!-- Removed line highlighted -->
        <rect x="18" y="55" width="460" height="22" fill="#ef4444" fill-opacity="0.2" rx="4" />
        <text x="0" y="70"><tspan fill="#ef4444">- </tspan><tspan fill="#71717a">3 </tspan>  <tspan fill="#f87171">"status"</tspan>: <tspan fill="#fca5a5">"inactive"</tspan>,</text>
        <text x="0" y="94"><tspan fill="#71717a">4 </tspan>  <tspan fill="#60a5fa">"port"</tspan>: <tspan fill="#fbbf24">8080</tspan>,</text>
        <text x="0" y="118"><tspan fill="#71717a">5 </tspan>  <tspan fill="#60a5fa">"replicas"</tspan>: <tspan fill="#fbbf24">2</tspan></text>
        <text x="0" y="142"><tspan fill="#71717a">6 </tspan>&#125;</text>
      </g>
    </g>

    <!-- Center Divider -->
    <line x1="530" y1="38" x2="530" y2="235" stroke="#232630" stroke-width="1.5" />

    <!-- Right Editor (Modified) -->
    <g transform="translate(555, 55)">
      <text x="0" y="0" font-family="monospace" font-size="11" fill="#71717a">MODIFIED (After)</text>
      <g font-family="monospace" font-size="13" fill="#e4e4e7">
        <text x="0" y="24"><tspan fill="#71717a">1 </tspan>&#123;</text>
        <text x="0" y="46"><tspan fill="#71717a">2 </tspan>  <tspan fill="#60a5fa">"service"</tspan>: <tspan fill="#34d399">"auth-api"</tspan>,</text>
        <!-- Added line highlighted -->
        <rect x="18" y="55" width="460" height="22" fill="#10b981" fill-opacity="0.2" rx="4" />
        <text x="0" y="70"><tspan fill="#10b981">+ </tspan><tspan fill="#71717a">3 </tspan>  <tspan fill="#86efac">"status"</tspan>: <tspan fill="#bbf7d0">"active"</tspan>,</text>
        <text x="0" y="94"><tspan fill="#71717a">4 </tspan>  <tspan fill="#60a5fa">"port"</tspan>: <tspan fill="#fbbf24">8080</tspan>,</text>
        <!-- Modified value highlighted -->
        <rect x="18" y="103" width="460" height="22" fill="#f59e0b" fill-opacity="0.2" rx="4" />
        <text x="0" y="118"><tspan fill="#f59e0b">~ </tspan><tspan fill="#71717a">5 </tspan>  <tspan fill="#60a5fa">"replicas"</tspan>: <tspan fill="#fde047">5</tspan></text>
        <text x="0" y="142"><tspan fill="#71717a">6 </tspan>&#125;</text>
      </g>
    </g>
  </g>

  <!-- Bottom Badges Row -->
  <g transform="translate(70, 520)">
    <!-- Badge 1 -->
    <g transform="translate(0, 0)">
      <rect width="180" height="34" rx="8" fill="#14161b" stroke="#232630" />
      <text x="14" y="22" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="12" font-weight="600" fill="#d4d4d8">⚡ Zero Server Uploads</text>
    </g>
    <!-- Badge 2 -->
    <g transform="translate(196, 0)">
      <rect width="200" height="34" rx="8" fill="#14161b" stroke="#232630" />
      <text x="14" y="22" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="12" font-weight="600" fill="#d4d4d8">🔍 Semantic Key Sorting</text>
    </g>
    <!-- Badge 3 -->
    <g transform="translate(412, 0)">
      <rect width="190" height="34" rx="8" fill="#14161b" stroke="#232630" />
      <text x="14" y="22" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="12" font-weight="600" fill="#d4d4d8">🧩 RFC 6902 JSON Patch</text>
    </g>
    <!-- Badge 4 -->
    <g transform="translate(618, 0)">
      <rect width="190" height="34" rx="8" fill="#14161b" stroke="#232630" />
      <text x="14" y="22" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="12" font-weight="600" fill="#d4d4d8">🆔 Array Match by Key</text>
    </g>
    <!-- Website URL right aligned -->
    <text x="1060" y="23" text-anchor="end" font-family="monospace" font-size="15" font-weight="700" fill="#9ca3af">jsoncompareonline.com</text>
  </g>
</svg>`;

const publicDir = path.resolve(__dirname, 'public');
const svgPath = path.join(publicDir, 'og-image.svg');
const pngPath = path.join(publicDir, 'og-image.png');

fs.writeFileSync(svgPath, svgContent, 'utf8');
console.log('Saved og-image.svg');

sharp(Buffer.from(svgContent))
  .resize(1200, 630)
  .png()
  .toFile(pngPath)
  .then(() => {
    console.log('Successfully generated public/og-image.png');
  })
  .catch(err => {
    console.error('Error generating png:', err);
  });

