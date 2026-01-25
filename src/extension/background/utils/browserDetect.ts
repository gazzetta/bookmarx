export interface BrowserInfo {
    browser: 'chrome' | 'brave' | 'edge' | 'firefox' | 'opera' | 'vivaldi' | 'unknown';
    browserVersion: string;
    os: 'windows' | 'macos' | 'linux' | 'android' | 'ios' | 'unknown';
    osVersion: string;
    isChromium: boolean;
}

export async function detectBrowser(): Promise<BrowserInfo> {
    const userAgent = navigator.userAgent;
    
    // Detect browser
    let browser: BrowserInfo['browser'] = 'unknown';
    let browserVersion = '';
    let isChromium = false;

    // Check for Brave first (it has a special API)
    if ((navigator as any).brave && await (navigator as any).brave.isBrave()) {
        browser = 'brave';
        isChromium = true;
        const match = userAgent.match(/Chrome\/(\d+\.\d+\.\d+\.\d+)/);
        browserVersion = match ? match[1] : '';
    }
    // Edge (Chromium-based)
    else if (userAgent.includes('Edg/')) {
        browser = 'edge';
        isChromium = true;
        const match = userAgent.match(/Edg\/(\d+\.\d+\.\d+\.\d+)/);
        browserVersion = match ? match[1] : '';
    }
    // Opera
    else if (userAgent.includes('OPR/') || userAgent.includes('Opera/')) {
        browser = 'opera';
        isChromium = true;
        const match = userAgent.match(/OPR\/(\d+\.\d+\.\d+\.\d+)/) || userAgent.match(/Opera\/(\d+\.\d+)/);
        browserVersion = match ? match[1] : '';
    }
    // Vivaldi
    else if (userAgent.includes('Vivaldi/')) {
        browser = 'vivaldi';
        isChromium = true;
        const match = userAgent.match(/Vivaldi\/(\d+\.\d+\.\d+\.\d+)/);
        browserVersion = match ? match[1] : '';
    }
    // Firefox
    else if (userAgent.includes('Firefox/')) {
        browser = 'firefox';
        isChromium = false;
        const match = userAgent.match(/Firefox\/(\d+\.\d+)/);
        browserVersion = match ? match[1] : '';
    }
    // Chrome (must be last among Chromium browsers)
    else if (userAgent.includes('Chrome/')) {
        browser = 'chrome';
        isChromium = true;
        const match = userAgent.match(/Chrome\/(\d+\.\d+\.\d+\.\d+)/);
        browserVersion = match ? match[1] : '';
    }

    // Detect OS
    let os: BrowserInfo['os'] = 'unknown';
    let osVersion = '';

    if (userAgent.includes('Windows NT')) {
        os = 'windows';
        const match = userAgent.match(/Windows NT (\d+\.\d+)/);
        if (match) {
            const ntVersion = match[1];
            // Map NT versions to Windows versions
            const ntMap: Record<string, string> = {
                '10.0': '10/11',
                '6.3': '8.1',
                '6.2': '8',
                '6.1': '7',
                '6.0': 'Vista',
                '5.1': 'XP'
            };
            osVersion = ntMap[ntVersion] || ntVersion;
        }
    } else if (userAgent.includes('Mac OS X')) {
        os = 'macos';
        const match = userAgent.match(/Mac OS X (\d+[._]\d+[._]?\d*)/);
        osVersion = match ? match[1].replace(/_/g, '.') : '';
    } else if (userAgent.includes('Linux')) {
        if (userAgent.includes('Android')) {
            os = 'android';
            const match = userAgent.match(/Android (\d+\.?\d*)/);
            osVersion = match ? match[1] : '';
        } else {
            os = 'linux';
            osVersion = '';
        }
    } else if (userAgent.includes('iPhone') || userAgent.includes('iPad')) {
        os = 'ios';
        const match = userAgent.match(/OS (\d+_\d+)/);
        osVersion = match ? match[1].replace(/_/g, '.') : '';
    }

    return {
        browser,
        browserVersion,
        os,
        osVersion,
        isChromium
    };
}

export function getBrowserDisplayName(browser: BrowserInfo['browser']): string {
    const names: Record<BrowserInfo['browser'], string> = {
        chrome: 'Google Chrome',
        brave: 'Brave',
        edge: 'Microsoft Edge',
        firefox: 'Mozilla Firefox',
        opera: 'Opera',
        vivaldi: 'Vivaldi',
        unknown: 'Unknown Browser'
    };
    return names[browser];
}

export function getOsDisplayName(os: BrowserInfo['os']): string {
    const names: Record<BrowserInfo['os'], string> = {
        windows: 'Windows',
        macos: 'macOS',
        linux: 'Linux',
        android: 'Android',
        ios: 'iOS',
        unknown: 'Unknown OS'
    };
    return names[os];
}
