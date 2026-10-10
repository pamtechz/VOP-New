import React from 'react';
import { normalizeStudyPlateDocument, type StudyPlateDocument, type StudyPlateLeaf, type StudyPlateNode } from '../../../shared/studyPlateDocument';
import { isSafeHttpsMediaUrl } from '../../../shared/mediaSources';
import { MediaPlayer } from '../media/MediaPlayer';
import { parseScriptureTokens } from '../../services/scriptureLookup';
import { BookOpen } from 'lucide-react';
import './study-plate.css';
import './lesson-reader-audio.css';

function leafContent(leaf: StudyPlateLeaf, key: string, onScriptureClick?: (reference: string, passageText?: string, translation?: string) => void): React.ReactNode {
  let value: React.ReactNode = leaf.text;

  // Render explicitly marked Bible verse with version tag
  if (leaf.scriptureRef || leaf.bibleVersion || leaf.isScriptureVerse) {
    const ref = leaf.scriptureRef || (typeof leaf.text === 'string' ? leaf.text : '');
    const ver = leaf.bibleVersion ? ` (${leaf.bibleVersion})` : '';
    value = onScriptureClick && ref ? (
      <button
        key={key + '-verse'}
        type="button"
        className="vop-scripture-ref-btn vop-scripture-verse-tagged"
        onClick={(e) => {
          e.stopPropagation();
          // Only treat text longer than a bare reference as an author-supplied
          // verse. Plain citations should use the Bible lookup instead.
          const written=leaf.text.trim();
          const isReferenceOnly=written.replace(/[“”"'‘’.\s]/g,'').toLowerCase()
            ===ref.replace(/[“”"'‘’.\s]/g,'').toLowerCase();
          onScriptureClick(ref,isReferenceOnly?'':written,leaf.bibleVersion);
        }}
        title={`View Scripture: ${ref}${ver}`}
        aria-label={`View Scripture: ${ref}${ver}`}
      >
        <BookOpen size={11} style={{ display: 'inline', verticalAlign: '-1px', marginRight: '3px' }} />
        <span>{value}</span>
        {leaf.bibleVersion && <span className="vop-scripture-version-tag">{leaf.bibleVersion}</span>}
      </button>
    ) : (
      <span className="vop-scripture-verse-tagged">
        <BookOpen size={11} style={{ display: 'inline', verticalAlign: '-1px', marginRight: '3px' }} />
        <span>{value}</span>
        {leaf.bibleVersion && <span className="vop-scripture-version-tag">{leaf.bibleVersion}</span>}
      </span>
    );
  } else if (!leaf.code && onScriptureClick && typeof leaf.text === 'string') {
    // Intercept and highlight clickable scripture references if handler is provided
    const tokens = parseScriptureTokens(leaf.text);
    if (tokens.length > 1 || (tokens.length === 1 && tokens[0].isScripture)) {
      value = tokens.map((token, idx) => {
        if (!token.isScripture) {
          return <React.Fragment key={idx}>{token.text}</React.Fragment>;
        }
        return (
          <button
            key={idx}
            type="button"
            className="vop-scripture-ref-btn"
            onClick={(e) => {
              e.stopPropagation();
              onScriptureClick(token.reference || token.text);
            }}
            title={`View scripture: ${token.reference || token.text}`}
            aria-label={`View scripture: ${token.reference || token.text}`}
          >
            <BookOpen size={11} style={{ display: 'inline', verticalAlign: '-1px', marginRight: '2px' }} />
            {token.text}
          </button>
        );
      });
    }
  }

  if (leaf.code) value = <code>{value}</code>;
  if (leaf.strikethrough) value = <s>{value}</s>;
  if (leaf.underline) value = <u>{value}</u>;
  if (leaf.italic) value = <em>{value}</em>;
  if (leaf.bold) value = <strong>{value}</strong>;
  if (leaf.subscript) value = <sub>{value}</sub>;
  if (leaf.superscript) value = <sup>{value}</sup>;

  if (leaf.color || leaf.backgroundColor || leaf.fontFamily || leaf.fontSize || leaf.textShadow) {
    const leafStyle: React.CSSProperties = {};
    if (leaf.color) leafStyle.color = leaf.color;
    if (leaf.backgroundColor) leafStyle.backgroundColor = leaf.backgroundColor;
    if (leaf.fontFamily) leafStyle.fontFamily = leaf.fontFamily;
    if (leaf.fontSize) leafStyle.fontSize = leaf.fontSize;
    if (leaf.textShadow) leafStyle.textShadow = leaf.textShadow;
    value = <span style={leafStyle}>{value}</span>;
  }

  return <React.Fragment key={key}>{value}</React.Fragment>;
}

function renderNode(node: StudyPlateNode | StudyPlateLeaf, key: string, onScriptureClick?: (reference: string, passageText?: string, translation?: string) => void): React.ReactNode {
  if ('text' in node) return leafContent(node, key, onScriptureClick);
  const children = node.children.map((item, index) => renderNode(item, key + '-' + index, onScriptureClick));

  const nodeStyle: React.CSSProperties = {};
  if (node.align) nodeStyle.textAlign = node.align;
  if (node.indent) nodeStyle.paddingLeft = `${node.indent * 1.5}rem`;
  if (node.lineHeight) nodeStyle.lineHeight = node.lineHeight;
  if (node.backgroundColor) {
    nodeStyle.backgroundColor = node.backgroundColor;
    nodeStyle.padding = nodeStyle.padding || '0.5rem 0.75rem';
    nodeStyle.borderRadius = '0.5rem';
  }
  if (node.borderColor) {
    nodeStyle.borderLeft = `4px solid ${node.borderColor}`;
    nodeStyle.paddingLeft = '0.75rem';
  }

  const hasStyle = Object.keys(nodeStyle).length > 0;

  switch (node.type) {
    case 'h1': return <h2 key={key} className="vop-study-plate-heading" style={hasStyle ? nodeStyle : undefined}>{children}</h2>;
    case 'h2': return <h3 key={key} className="vop-study-plate-subheading" style={hasStyle ? nodeStyle : undefined}>{children}</h3>;
    case 'h3': return <h4 key={key} className="vop-study-plate-subheading" style={hasStyle ? nodeStyle : undefined}>{children}</h4>;
    case 'blockquote': return <blockquote key={key} style={hasStyle ? nodeStyle : undefined}>{children}</blockquote>;
    case 'ul': return <ul key={key} style={hasStyle ? nodeStyle : undefined}>{children}</ul>;
    case 'ol': return <ol key={key} style={hasStyle ? nodeStyle : undefined}>{children}</ol>;
    case 'li': return <li key={key} style={hasStyle ? nodeStyle : undefined}>{children}</li>;
    case 'lic': return <span key={key} style={hasStyle ? nodeStyle : undefined}>{children}</span>;
    case 'table': return <div key={key} className="vop-study-table-wrapper"><table className={`vop-study-table vop-study-table-${node.tableStyle||'grid'}`}
      style={{...nodeStyle,...(node.colWidths?.length?{width:node.colWidths.reduce((sum,n)=>sum+n,0)}:{})}}>
      {node.colWidths?.length&&<colgroup>{node.colWidths.map((width,index)=><col key={index} style={{width}}/>)}</colgroup>}
      <tbody>{children}</tbody></table></div>;
    case 'tr': return <tr key={key} style={node.rowHeight?{height:node.rowHeight}:undefined}>{children}</tr>;
    case 'th':
    case 'td': {
      if(node.covered)return null;
      const cellStyle={...nodeStyle};
      if(node.borderColor){delete cellStyle.borderLeft;cellStyle.border='1px solid '+node.borderColor;}
      const attrs={rowSpan:node.rowSpan||1,colSpan:node.colSpan||1,style:cellStyle};
      return node.type==='th'
        ?<th key={key} {...attrs} scope="col">{children}</th>
        :<td key={key} {...attrs}>{children}</td>;
    }
    case 'callout': return <div key={key} className={`vop-study-callout vop-callout-${node.calloutType || 'info'}`} style={hasStyle ? nodeStyle : undefined}>{children}</div>;
    case 'a': return node.url && isSafeHttpsMediaUrl(node.url)
      ? <a key={key} href={node.url} target="_blank" rel="noopener noreferrer" style={hasStyle ? nodeStyle : undefined}>{children}</a>
      : <span key={key} style={hasStyle ? nodeStyle : undefined}>{children}</span>;
    case 'img': return node.url && isSafeHttpsMediaUrl(node.url)
      ? <figure key={key} style={hasStyle ? nodeStyle : undefined}><img src={node.url} alt={node.alt||''}
          loading="lazy" /></figure>
      : null;
    case 'video': return node.url ? <div key={key} className="vop-study-plate-media"><MediaPlayer src={node.url} title="Study video" kind="video" /></div> : null;
    case 'audio': return node.url ? <div key={key} className="vop-study-plate-media"><MediaPlayer src={node.url} title="Study audio" kind="audio" /></div> : null;
    case 'code_block': return <pre key={key}><code>{node.children.map(item => 'text' in item ? item.text : '').join('')}</code></pre>;
    default: return <p key={key} style={hasStyle ? nodeStyle : undefined}>{children}</p>;
  }
}

/** Read-only rendering of validated Plate JSON without raw HTML injection,
 * arbitrary embedded scripts or private assessment data. */
export function StudyPlateContent({ document, afterBlock, onScriptureClick }: {
  document: StudyPlateDocument;
  afterBlock?: (anchorId: string) => React.ReactNode;
  onScriptureClick?: (reference: string, passageText?: string, translation?: string) => void;
}) {
  // Treat learner-readable Firestore records as untrusted, including older
  // records written before the API enforced document validation. A malformed
  // document must fail closed rather than crash the entire lesson reader.
  const safe = React.useMemo(() => {
    try { return normalizeStudyPlateDocument(document); }
    catch { return null; }
  }, [document]);
  if (!safe) return <p className="vop-study-plate-error" role="alert">
    This page contains unsupported content. Contact your course administrator.
  </p>;
  return <div className="vop-study-plate">{safe.map((node, index) => <React.Fragment key={node.id || String(index)}>
    {renderNode(node, node.id || String(index), onScriptureClick)}
    {node.id && afterBlock?.(node.id)}
  </React.Fragment>)}</div>;
}
