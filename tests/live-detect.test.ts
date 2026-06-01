import { describe, it, expect } from "vitest";
import { detectStack } from "../src/scanner/index.js";
import { scoreStack } from "../src/scoring/index.js";
import { generateFixes, applyFixes } from "../src/fixer/index.js";

// These tests are fully offline and deterministic. detectStack is a pure
// function over served HTML, so the live scanner's parsing and the score it
// produces are covered without any network access (CI stays green).

const brokenHtml = `
<!doctype html><html><head>
<script>(function(w,d,s,l,i){w[l]=w[l]||[];})(window,document,'script','dataLayer','GTM-ABCD123');</script>
<script src="https://www.googletagmanager.com/gtag/js?id=G-ABC123DEF4"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('consent','default',{ad_storage:'denied',analytics_storage:'denied',ad_user_data:'denied',ad_personalization:'denied'});
  gtag('js', new Date()); gtag('config','G-ABC123DEF4');
</script>
<script>!function(f,b,e,v,n,t,s){}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');
fbq('init','123456789012345');fbq('track','PageView');</script>
</head><body>broken store</body></html>`;

const cleanHtml = `
<!doctype html><html><head>
<script>(function(w,d,s,l,i){})(window,document,'script','dataLayer','GTM-WXYZ987');</script>
<script>
  function gtag(){dataLayer.push(arguments);}
  gtag('consent','default',{ad_storage:'denied',analytics_storage:'denied',wait_for_update:500});
  gtag('config','G-CLEAN12345',{transport_url:'https://sgtm.brand.com',allow_enhanced_conversions:true});
</script>
</head><body>clean store</body></html>`;

describe("detectStack (live Fast scan parsing)", () => {
  it("reads a broken stack from served HTML and scores it 44/F", () => {
    const { snapshot } = detectStack(brokenHtml, "https://shop.example", "https://shop.example");
    expect(snapshot.gtm.webContainer).toBe(true);
    expect(snapshot.gtm.containerId).toBe("GTM-ABCD123");
    expect(snapshot.ga4.installed).toBe(true);
    expect(snapshot.ga4.measurementId).toBe("G-ABC123DEF4");
    expect(snapshot.metaPixel.installed).toBe(true);
    expect(snapshot.metaPixel.pixelId).toBe("123456789012345");
    expect(snapshot.consentMode.present).toBe(true);
    expect(snapshot.consentMode.defaultDenied).toBe(true);
    expect(snapshot.consentMode.blocksTagsWhenUnknown).toBe(true);

    const before = scoreStack(snapshot);
    expect(before.score).toBe(44);
    expect(before.grade).toBe("F");
    expect(before.estimatedConversionsLostPct).toBe(32);
  });

  it("recovers the broken stack through the same fix loop the demo uses", () => {
    const { snapshot } = detectStack(brokenHtml, "https://shop.example", "https://shop.example");
    const before = scoreStack(snapshot);
    const fixes = generateFixes(before.issues);
    const after = scoreStack(applyFixes(snapshot, fixes));
    expect(fixes.length).toBe(4); // enhanced-conversions-off has no auto-fix
    expect(after.score).toBe(94);
    expect(after.grade).toBe("A");
  });

  it("labels confirmed signals as observed and unprovable ones as assumed", () => {
    const { evidence } = detectStack(brokenHtml, "https://shop.example", "https://shop.example");
    const observed = evidence.observed.join(" | ");
    const assumed = evidence.assumed.join(" | ");
    expect(observed).toMatch(/GTM-ABCD123/);
    expect(observed).toMatch(/G-ABC123DEF4/);
    expect(observed.toLowerCase()).toMatch(/pixel|meta|fbq|123456789012345/);
    expect(assumed.toLowerCase()).toMatch(/server-side|measurement protocol|attribution/);
  });

  it("treats wait_for_update consent as non-blocking and reads a server container + enhanced conversions", () => {
    const { snapshot } = detectStack(cleanHtml, "https://nice.example", "https://nice.example");
    expect(snapshot.consentMode.present).toBe(true);
    expect(snapshot.consentMode.blocksTagsWhenUnknown).toBe(false);
    expect(snapshot.gtm.serverContainer).toBe(true); // non-google transport_url
    expect(snapshot.enhancedConversions).toBe(true);
  });

  it("flags a page with no tags as thin and observes nothing", () => {
    const { snapshot, thin, evidence } = detectStack(
      "<!doctype html><html><head><title>nothing</title></head><body>hi</body></html>",
      "https://empty.example",
      "https://empty.example",
    );
    expect(thin).toBe(true);
    expect(snapshot.gtm.webContainer).toBe(false);
    expect(snapshot.ga4.installed).toBe(false);
    expect(snapshot.metaPixel.installed).toBe(false);
    expect(evidence.observed.length).toBe(0);
  });
});
