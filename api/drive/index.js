export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader('Access-Control-Allow-Headers', '*');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { action, id } = req.query;

  // Stream a file from Google Drive (PDF, audio, presentation)
  if (action === 'file' && id) {
    try {
      const driveUrl = `https://drive.usercontent.google.com/download?id=${id}&export=download`;
      const streamRes = await fetch(driveUrl);
      if (!streamRes.ok) {
        return res.redirect(302, `https://drive.google.com/uc?export=download&id=${id}`);
      }
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'inline; filename="tema.pdf"');
      const length = streamRes.headers.get('content-length');
      if (length) res.setHeader('Content-Length', length);
      res.setHeader('Cache-Control', 'public, max-age=86400');

      const buffer = await streamRes.arrayBuffer();
      return res.status(200).send(Buffer.from(buffer));
    } catch (err) {
      console.error('Drive proxy error:', err);
      return res.redirect(302, `https://drive.google.com/uc?export=download&id=${id}`);
    }
  }

  const folders = {
    B1: { id: '1WIDLo9OhfZjoE1BYP16n1q84-KOy18FP', name: 'Bloque I' },
    B2: { id: '1kPKos8q94t6fMAmejhdQL4cgER5TKTxY', name: 'Bloque II' },
    B3: { id: '1_c5tKQKTarWBu58vAsZ3C4lFbv_X4A8y', name: 'Bloque III' },
    B4: { id: '1uplPbNF_aHZrl0msNrKpyO4UCFRHuVOC', name: 'Bloque IV' },
    B5: { id: '1DOWByB_lFiAXvam8TTtH2LCoK3zP-f0B', name: 'Bloque V' },
    B6: { id: '12-VAdYd2iyzF_SX7gIDRhQku3eHmgPSX', name: 'Bloque VI' },
    audios: { id: '1JxXeLRo7JvkPUNsB2DJNiIn0FNgFd2R7', name: 'AUDIOS' },
    videos: { id: '1pQYySi2ly8X6vN1aFQnT2npvi-01yjyl', name: 'VIDEOS' },
    powerpoints: { id: '1yaImtGlPOu734-JmvwHHITAfV0FTCNkI', name: 'POWERPOINTS' }
  };

  try {
    const result = {};
    for (const [key, info] of Object.entries(folders)) {
      result[key] = await getFolderFiles(info.id);
    }
    return res.status(200).json({ success: true, folders: result });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
}

async function getFolderFiles(folderId) {
  try {
    const response = await fetch(`https://drive.google.com/drive/folders/${folderId}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    if (!response.ok) return [];
    const html = await response.text();
    const matches = [...html.matchAll(/\[\[null,"([a-zA-Z0-9_\-]+)"],null,null,null,"([^"]+)"[\s\S]*?\[\[\["([^"]+)",null,1]]]/g)];
    return matches.map(m => ({ id: m[1], mimeType: m[2], name: m[3] }));
  } catch {
    return [];
  }
}
