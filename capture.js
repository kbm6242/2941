const { chromium } = require('playwright');
const fs = require('fs');

const hour = process.argv[2];
const isUSTime = (hour === '7' || hour === '07' || hour === 'all' || hour === 'manual');
const isKRTime = (hour === '16' || hour === 'all' || hour === 'manual');

const CAPTURES = [
{
  id: 'sp500',
  name: 'S&P 500',
  url: 'https://finviz.com/map.ashx?t=sec&mn=snp500&o=-perf1d',
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
  url: 'https://finviz.com/map.ashx?t=sec_ndx&o=-perf1d',
  isImage: false,
  waitMs: 8000,
  selector: null,
  clip: { x: 400, y: 60, width: 1210, height: 730 },
  viewport: { width: 1800, height: 900 },
  output: 'images/heatmap_nasdaq.png',
  runAt: 'US',
},
  {
    id: 'kospi',
    name: '코스피',
    url: 'https://markets.hankyung.com/marketmap/kospi',
    isImage: false,
    waitMs: 9000,
    selector: '.heatmap-wrap',  // 또는 실제 히트맵 컨테이너 클래스
    viewport: { width: 1300, height: 900 },
    output: 'images/heatmap_kospi.png',
    runAt: 'KR',
  },
];

async function captureTarget(config, browser) {
  console.log(`\n📸 [${config.name}] 캡처 시작...`);
  console.log(`   URL: ${config.url}`);

  // 각 캡처마다 뷰포트 크기를 개별 설정
  const context = await browser.newContext({
    viewport: config.viewport || { width: 1800, height: 900 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    locale: 'ko-KR',
    timezoneId: 'Asia/Seoul',
  });

  const page = await context.newPage();

  try {
    await page.goto(config.url, { waitUntil: 'domcontentloaded', timeout: 40000 });

    // 광고/팝업 닫기 시도
    try {
      await page.keyboard.press('Escape');
    } catch (_) {}

    // 렌더링 대기
    await page.waitForTimeout(config.waitMs);

    // 코스피 히트맵: 상단 헤더/팝업 건너뛰고 스크롤
    if (config.id === 'kospi') {
      await page.evaluate(() => window.scrollTo(0, 200));
      await page.waitForTimeout(500);
    }

    // 스크롤바 숨기기 (깔끔한 캡처)
    await page.addStyleTag({
      content: `
        ::-webkit-scrollbar { display: none !important; }
        * { scrollbar-width: none !important; }
        /* 헤더/팝업/배너 제거 */
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
      console.log(`   📐 요소 크기: ${Math.round(box.width)}×${Math.round(box.height)}`);

      // clip 방식으로 캡처 (canvas 요소도 정확히 캡처됨)
      await page.screenshot({
        path: config.output,
        type: 'png',
        clip: {
          x: box.x,
          y: box.y,
          width: box.width,
          height: box.height,
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
