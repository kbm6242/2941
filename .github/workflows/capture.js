/**
 * 히트맵 자동 캡처 스크립트
 * GitHub Actions에서 실행됩니다.
 * 
 * 사용법:
 *   node capture.js [KST시]
 *   예) node capture.js 7   → S&P500, 나스닥 캡처
 *       node capture.js 16  → 코스피 캡처
 *       node capture.js all → 전부 캡처 (수동 테스트용)
 */

const { chromium } = require('playwright');
const fs = require('fs');

const hour = process.argv[2];
const isUSTime  = (hour === '7'  || hour === '07' || hour === 'all');
const isKRTime  = (hour === '16' || hour === 'all');

// 캡처 설정
const CAPTURES = [
  {
    id: 'sp500',
    name: 'S&P 500',
    url: 'https://finviz.com/map.ashx?t=sec&mn=snp500&o=-perf1d',
    selector: '#mapcanvas',           // Finviz 히트맵 캔버스 요소
    fallbackFull: true,               // 선택자 없으면 전체 화면 캡처
    waitMs: 5000,                     // 렌더링 대기 시간 (ms)
    output: 'images/heatmap_sp500.png',
    runAt: 'US',
  },
  {
    id: 'nasdaq',
    name: 'Nasdaq 100',
    url: 'https://finviz.com/map.ashx?t=sec_etf&mn=nasdaq&o=-perf1d',
    selector: '#mapcanvas',
    fallbackFull: true,
    waitMs: 5000,
    output: 'images/heatmap_nasdaq.png',
    runAt: 'US',
  },
  {
    id: 'kospi',
    name: '코스피',
    url: 'https://m.stock.naver.com/domestic/index/KOSPI/marketValue',
    selector: '.GraphChartWrap',
    fallbackFull: true,
    waitMs: 6000,
    output: 'images/heatmap_kospi.png',
    runAt: 'KR',
  },
];

async function capture(page, config) {
  console.log(`\n📸 [${config.name}] 캡처 시작...`);
  console.log(`   URL: ${config.url}`);

  try {
    await page.goto(config.url, {
      waitUntil: 'networkidle',
      timeout: 30000,
    });

    // 추가 렌더링 대기
    await page.waitForTimeout(config.waitMs);

    let element = null;

    // 선택자로 요소 찾기 시도
    if (config.selector) {
      try {
        element = await page.waitForSelector(config.selector, { timeout: 8000 });
        console.log(`   ✅ 선택자 발견: ${config.selector}`);
      } catch {
        console.log(`   ⚠️  선택자 없음, 전체 화면 캡처로 전환`);
      }
    }

    const screenshotOptions = {
      path: config.output,
      type: 'png',
    };

    if (element && !config.fallbackFull) {
      await element.screenshot(screenshotOptions);
    } else if (element) {
      // 요소 중심으로 뷰포트 조정 후 전체 캡처
      await element.scrollIntoViewIfNeeded();
      await page.screenshot({ ...screenshotOptions, fullPage: false });
    } else {
      await page.screenshot({ ...screenshotOptions, fullPage: false });
    }

    const stats = fs.statSync(config.output);
    console.log(`   ✅ 저장 완료: ${config.output} (${(stats.size / 1024).toFixed(1)} KB)`);
    return true;

  } catch (err) {
    console.error(`   ❌ 캡처 실패: ${err.message}`);

    // 실패 시 플레이스홀더 이미지 생성 (이전 이미지 유지)
    if (!fs.existsSync(config.output)) {
      console.log(`   → 플레이스홀더 생성`);
      // 빈 1x1 PNG
      const emptyPng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
      fs.writeFileSync(config.output, emptyPng);
    }
    return false;
  }
}

(async () => {
  console.log('🚀 히트맵 캡처 시작');
  console.log(`   모드: hour=${hour}, US장=${isUSTime}, KR장=${isKRTime}`);

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
      '--disable-blink-features=AutomationControlled',
    ],
  });

  const context = await browser.newContext({
    viewport: { width: 1600, height: 800 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    locale: 'ko-KR',
    timezoneId: 'Asia/Seoul',
  });

  const page = await context.newPage();

  // 광고/팝업 차단
  await page.route('**/*', (route) => {
    const url = route.request().url();
    if (url.includes('ads') || url.includes('analytics') || url.includes('tracker')) {
      route.abort();
    } else {
      route.continue();
    }
  });

  let successCount = 0;
  for (const config of targets) {
    const ok = await capture(page, config);
    if (ok) successCount++;
  }

  await browser.close();

  console.log(`\n🏁 완료: ${successCount}/${targets.length} 성공`);
  process.exit(successCount > 0 ? 0 : 1);
})();
