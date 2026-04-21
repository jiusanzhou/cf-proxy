export default async function handler(req, res) {
  const target = req.query.url;
  if (!target) {
    return res.status(400).json({ error: 'Missing url param' });
  }
  
  const u = new URL(target);
  const allowed = ['eastmoney.com', 'szse.cn', 'sse.com.cn'];
  if (!allowed.some(d => u.hostname.endsWith(d))) {
    return res.status(403).json({ error: 'Domain not allowed' });
  }
  
  // Determine method and headers based on target
  const isSzse = u.hostname.endsWith('szse.cn');
  const isSse = u.hostname.endsWith('sse.com.cn');
  let headers;
  if (isSzse) {
    headers = {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      'Accept': 'application/json, text/plain, */*',
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
      'Origin': 'https://reits.szse.cn',
      'Referer': 'https://reits.szse.cn/disclosure/index.html',
      'Content-Type': 'application/json',
    };
  } else if (isSse) {
    headers = {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      'Accept': 'application/json, text/plain, */*',
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
      'Referer': 'https://www.sse.com.cn/disclosure/fund/announcement/',
    };
  } else {
    headers = {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      'Accept': '*/*',
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
      'Referer': 'https://quote.eastmoney.com/',
    };
  }

  try {
    const fetchOpts = { headers };
    
    if (req.method === 'POST') {
      // Forward POST body
      fetchOpts.method = 'POST';
      fetchOpts.body = JSON.stringify(req.body);
    }
    
    const resp = await fetch(target, fetchOpts);
    const data = await resp.text();
    res.setHeader('Content-Type', resp.headers.get('content-type') || 'application/json');
    res.status(resp.status).send(data);
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
}
