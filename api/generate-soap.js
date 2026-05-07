export default async function handler(req, res) {
  // 允許你的 GitHub Pages 與 Vercel 前端呼叫
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'Vercel 尚未設定 GEMINI_API_KEY' });
    }

    const { observation = '', activities = '', caseName = '', diagnosis = '', age = '' } = req.body || {};

    if (!observation.trim()) {
      return res.status(400).json({ error: '請提供治療觀察文字' });
    }

    const prompt = `你是一位台灣兒童職能治療師助理。請根據治療師輸入的治療觀察，整理成專業、精簡、可放入治療紀錄的 SOAP 格式。

個案資訊：
- 姓名：${caseName || '未提供'}
- 年齡：${age || '未提供'}
- 診斷/主訴：${diagnosis || '未提供'}
- 活動項目：${activities || '未提供'}

治療師原始觀察：
${observation}

請遵守：
1. 使用繁體中文。
2. 內容要專業但不要過度診斷。
3. 不要捏造未出現的量化數據。
4. S 放主觀資料：家長主訴、個案狀態、情緒或主觀反應。
5. O 放客觀資料：治療中可觀察到的動作、行為、注意力、配合度與活動表現。
6. A 放臨床評估：能力表現、進步、困難、可能影響因素。
7. P 放後續計畫：下次治療方向、居家建議或家長衛教。
8. 只回傳合法 JSON，不要 Markdown，不要解釋。

JSON 格式：
{"S":"...","O":"...","A":"...","P":"..."}`;

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [{ text: prompt }]
            }
          ],
          generationConfig: {
            temperature: 0.25,
            maxOutputTokens: 1000,
            responseMimeType: 'application/json'
          }
        })
      }
    );

    const geminiData = await geminiRes.json();

    if (!geminiRes.ok) {
      const msg = geminiData?.error?.message || 'Gemini API 呼叫失敗';
      return res.status(500).json({ error: msg });
    }

    const text = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    let soap;

    try {
      soap = JSON.parse(text);
    } catch (err) {
      const match = text.match(/\{[\s\S]*\}/);
      if (!match) {
        return res.status(500).json({ error: 'AI 回傳格式不是 JSON', raw: text });
      }
      soap = JSON.parse(match[0]);
    }

    return res.status(200).json({
      soap: {
        S: soap.S || '',
        O: soap.O || '',
        A: soap.A || '',
        P: soap.P || ''
      }
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: error.message || '伺服器錯誤' });
  }
}
