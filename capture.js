const { chromium } = require('playwright');
const fs = require('fs');

const hour = process.argv[2];
const isUSTime = (hour === 'US' || hour === 'all');
const isKRTime = (hour === 'KR' || hour === 'all');

const CAPTURES = [
  {
    id: 'sp500',
    name: 'S&P 500',
    url: 'https://finviz.com/map.ashx?t=sec&mn=snp500',
    isImage: false,
    waitMs: 8000,
    selector: null,
    clip: { x: 400, y: 60, width: 1210, height: 730 },
    viewport: { width: 1800, height: 900 },
    output: 'images/heatmap_sp500.png',
    runAt: 'US',
  },
  {
    id: 'nasdaq',
    name: 'Nasdaq 100',
    url: 'https://finviz.com/map.ashx?t=sec_ndx',
    isImage: false,
    waitMs: 8000,
    selector: null,
    clip: { x: 400, y: 60, width: 1210, height: 730 },
    viewport: { width: 1800, height: 900 },
    output: 'images/heatmap_nasdaq.png',
    runAt: 'US',
  },
  {
    id: 'russell',
    name: 'Russell 2000',
    url: 'https://finviz.com/map.ashx?t=sec_rut',
    isImage: false,
    waitMs: 8000,
    selector: null,
    clip: { x: 400, y: 60, width: 1210, height: 730 },
    viewport: { width: 1800, height: 900 },
    output: 'images/heatmap_russell.png',
    runAt: 'US',
  },
  {
    id: 'kospi',
    name: '코스피',
    url: 'https://markets.hankyung.com/marketmap/kospi',
    isImage: false,
    waitMs: 9000,
    selector: '.heatmap-wrap',
    topOffset: 80,   // ✅ 상단 탭 영역(변동율 1일/1주...) 제외
    viewport: { width: 1300, height: 900 },
    output: 'images/heatmap_kospi.png',
    runAt: 'KR',
  },
  {
    id: 'kosdaq',
    name: '코스닥',                                        // ✅ 코스닥 추가
    url: 'https://markets.hankyung.com/marketmap/kosdaq',
    isImage: false,
    waitMs: 9000,
    selector: '.heatmap-wrap',
    topOffset: 80,   // ✅ 코스피와 동일하게 탭 영역 제외
    viewport: { width: 1300, height: 900 },
    output: 'images/heatmap_kosdaq.png',
    runAt: 'KR',
  },
];

async function captureTarget(config, browser) {
  console.log(`\n📸 [${config.name}] 캡처 시작...`);
  console.log(`   URL: ${config.url}`);

  const context = await browser.newContext({
    viewport: config.viewport || { width: 1800, height: 900 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    locale: 'ko-KR',
    timezoneId: 'Asia/Seoul',
  });

  const page = await context.newPage();

  try {
    await page.goto(config.url, { waitUntil: 'domcontentloaded', timeout: 40000 });

    try {
      await page.keyboard.press('Escape');
    } catch (_) {}

    await page.waitForTimeout(config.waitMs);

    // 코스피/코스닥: 상단 스크롤
    if (config.id === 'kospi' || config.id === 'kosdaq') {
      await page.evaluate(() => window.scrollTo(0, 200));
      await page.waitForTimeout(500);
    }

    await page.addStyleTag({
      content: `
        ::-webkit-scrollbar { display: none !important; }
        * { scrollbar-width: none !important; }
        .header, header, nav, footer, .ad,
        [class*="banner"], [class*="popup"], [id*="popup"],
        [class*="dismiss"], [class*="Dismiss"],
        [class*="modal"], [class*="toast"],
        [class*="gnb"], [class*="lnb"],
        .header-wrap, #header { display: none !important; }
      `
    });

    let element = null;
    if (config.selector) {
      try {
        element = await page.waitForSelector(config.selector, { timeout: 20000 });
        console.log(`   ✅ 선택자 발견: ${config.selector}`);
      } catch {
        console.log(`   ⚠️  선택자 없음 → 전체 화면 캡처`);
      }
    }

    if (element) {
      const box = await element.boundingBox();
      const offset = config.topOffset || 0;  // ✅ topOffset 적용
      console.log(`   📐 요소 크기: ${Math.round(box.width)}×${Math.round(box.height)} (topOffset: ${offset}px)`);

      await page.screenshot({
        path: config.output,
        type: 'png',
        clip: {
          x: box.x,
          y: box.y + offset,          // ✅ 탭 영역만큼 아래에서 시작
          width: box.width,
          height: box.height - offset, // ✅ 잘라낸 만큼 높이 보정
        },
      });
    } else if (config.clip) {
      await page.screenshot({
        path: config.output,
        type: 'png',
        clip: config.clip,
      });
    } else {
      await page.screenshot({
        path: config.output,
        type: 'png',
        fullPage: false,
      });
    }

    const stats = fs.statSync(config.output);
    console.log(`   ✅ 저장: ${config.output} (${(stats.size / 1024).toFixed(1)} KB)`);
    return true;

  } catch (err) {
    console.error(`   ❌ 실패: ${err.message}`);
    return false;
  } finally {
    await context.close();
  }
}

(async () => {
  console.log('🚀 히트맵 캡처 시작');
  console.log(`   hour=${hour} | US장=${isUSTime} | KR장=${isKRTime}`);

  const targets = CAPTURES.filter(c =>
    (c.runAt === 'US' && isUSTime) ||
    (c.runAt === 'KR' && isKRTime)
  );

  if (targets.length === 0) {
    console.log('⏭️  이 시각에 캡처할 대상 없음, 종료');
    process.exit(0);
  }

  const browser = await chromium.launch({
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--window-size=1800,900',
    ],
  });

  let successCount = 0;
  for (const config of targets) {
    const ok = await captureTarget(config, browser);
    if (ok) successCount++;
  }

  await browser.close();
  console.log(`\n🏁 완료: ${successCount}/${targets.length} 성공`);
  process.exit(successCount > 0 ? 0 : 1);
})();
