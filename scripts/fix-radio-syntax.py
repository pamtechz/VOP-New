from pathlib import Path
p=Path('src/pages/AdminRecordsPanel.tsx')
s=p.read_text()
needle='''          </div>\n\n          </div>\n        </div>\n      ) : ('''
if needle in s:
    s=s.replace(needle,'''          </div>\n        </div>\n      ) : (''',1)
else:
    raise SystemExit('radio workspace extra div pattern not found')
p.write_text(s)
print('radio syntax repaired')
