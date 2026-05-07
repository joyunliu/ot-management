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
      return res.status(500).json({
        error: 'Vercel 尚未設定 GEMINI_API_KEY'
      });
    }

    const {
      observation = '',
      activities = '',
      caseName = '',
      diagnosis = '',
      age = ''
    } = req.body || {};

    if (!observation.trim()) {
      return res.status(400).json({
        error: '請提供治療觀察文字'
      });
    }

    const prompt = `你是一位台灣兒童職能治療師助理。

請根據治療師輸入的內容，
整理成專業、簡潔、適合正式病歷紀錄的 SOAP 格式。

個案資訊：
- 姓名：${caseName || '未提供'}
- 年齡：${age || '未提供'}
- 診斷/主訴：${diagnosis || '未提供'}
- 活動項目：${activities || '未提供'}

治療師原始觀察：
${observation}

請遵守以下規則：

1. 使用繁體中文
2. 不要過度醫療化
3. 不要捏造不存在的數據
4. 保持職能治療紀錄語氣
5. S = 主觀表現、家長回饋、情緒狀態
6. O = 客觀觀察、活動表現、注意力、動作
7. A = 臨床分析、能力評估、困難原因
8. P = 下次方向、居家建議、治療計畫
9. 只回傳 JSON
10. 不要 Markdown
11. 不要額外解釋

JSON格式：

{
  "S":"...",
  "O":"...",
  "A":"...",
  "P":"..."
}
`;

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [
                {
                  text: prompt
                }
              ]
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
      const msg =
        geminiData?.error?.message ||
        'Gemini API 呼叫失敗';

      return res.status(500).json({
        error: msg
      });
    }

    const text =
      geminiData?.candidates?.[0]?.content?.parts?.[0]?.text || '';

    let soap;

    try {
      soap = JSON.parse(text);
    } catch (err) {
      const match = text.match(/\{[\s\S]*\}/);

      if (!match) {
        return res.status(500).json({
          error: 'AI 回傳格式不是 JSON',
          raw: text
        });
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

    return res.status(500).json({
      error: error.message || '伺服器錯誤'
    });
  }
}
