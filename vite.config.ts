import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

function devApiPlugin(): Plugin {
  return {
    name: 'dev-api-middleware',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url?.split('?')[0];

        if (url === '/api/account/profile' && req.method === 'POST') {
          let bodyStr = '';
          req.on('data', chunk => { bodyStr += chunk; });
          req.on('end', () => {
            const authHeader = String(req.headers['authorization'] || '');
            let uid = 'user-aubrey-matende';
            let email = 'obsndyxd@gmail.com';
            let name = 'Aubrey Matende';
            try {
              const token = authHeader.replace(/^Bearer\s+/, '').trim();
              const parts = token.split('.');
              if (parts.length === 3) {
                const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'));
                if (payload.user_id || payload.sub) uid = payload.user_id || payload.sub;
                if (payload.email) email = payload.email;
                if (payload.name) name = payload.name;
              }
            } catch {}

            const profile = {
              uid,
              displayName: name || 'Aubrey Matende',
              email: email || 'obsndyxd@gmail.com',
              phoneNumber: '+260 97 7206617',
              photoURL: '/assets/profile.png',
              role: 'super_admin',
              adminNodeType: 'super',
              adminNodeId: null,
              privileges: {
                admin: true,
                superAdmin: true,
                guardian: true,
                editor: true,
                manager: true,
                developer: true,
                coordinator: true,
              },
              information: {
                enrollmentDate: '2023-01-15',
                decisionDate: '2023-05-10',
                completionDate: '2023-06-12',
                graduationDate: '2023-06-12',
                baptismDate: '2023-07-01',
                graduating: false,
                graduated: true,
                baptismCandidate: true,
                baptized: false,
                guardian: 'Pst. Ernesto Ricci',
                notes: 'Super Admin - Full system authority and governance configurator.',
              },
              progress: {
                discoverProgress: 100,
                completedGuidesCount: 1,
                totalGuidesCount: 1,
                guideScores: { 'guide-1': 100 },
                completedLessons: ['lesson-1-0', 'lesson-1-1', 'lesson-1-2', 'lesson-1-3', 'lesson-1-4', 'lesson-1-5'],
              },
            };

            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ ok: true, profile }));
          });
          return;
        }

        if (url === '/api/admin/content' && req.method === 'POST') {
          let bodyStr = '';
          req.on('data', chunk => { bodyStr += chunk; });
          req.on('end', () => {
            let collection = '';
            let data: any = null;
            try {
              const parsed = JSON.parse(bodyStr || '{}');
              collection = parsed.collection || '';
              data = parsed.data || null;
            } catch {}
            if (!collection) {
              if (bodyStr.includes('languages')) collection = 'languages';
              else if (bodyStr.includes('settings')) collection = 'settings';
              else if (bodyStr.includes('users')) collection = 'users';
            }

            let items: any[] = [];
            if (collection === 'languages') {
              items = [
                { id: 'bem', code: 'BEM', name: 'Bemba', nativeName: 'Ichibemba', enabled: true, sortOrder: 1 },
                { id: 'eng', code: 'ENG', name: 'English', nativeName: 'English', enabled: true, sortOrder: 2 },
                { id: 'nya', code: 'NYA', name: 'Nyanja', nativeName: 'Chinyanja', enabled: true, sortOrder: 3 },
                { id: 'ton', code: 'TON', name: 'Tonga', nativeName: 'Chitonga', enabled: false, sortOrder: 4 },
                { id: 'loz', code: 'LOZ', name: 'Lozi', nativeName: 'Silozi', enabled: false, sortOrder: 5 },
                { id: 'kao', code: 'KAO', name: 'Kaonde', nativeName: 'Kiikaonde', enabled: false, sortOrder: 6 },
              ];
            }
            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ ok: true, items, item: data || (items[0] ?? null) }));
          });
          return;
        }

        if (url === '/api/admin/bootstrap' && req.method === 'POST') {
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ ok: true, message: 'Super administrator created.' }));
          return;
        }

        next();
      });
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), devApiPlugin()],
})

