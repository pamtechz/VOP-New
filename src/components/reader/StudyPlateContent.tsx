import React from 'react';
import type { StudyPlateDocument, StudyPlateLeaf, StudyPlateNode } from '../../../shared/studyPlateDocument';
import { isSafeHttpsMediaUrl } from '../../../shared/mediaSources';
import './study-plate.css';

function leafContent(leaf:StudyPlateLeaf,key:string):React.ReactNode {
  let value:React.ReactNode=leaf.text;
  if(leaf.code)value=<code>{value}</code>;
  if(leaf.strikethrough)value=<s>{value}</s>;
  if(leaf.underline)value=<u>{value}</u>;
  if(leaf.italic)value=<em>{value}</em>;
  if(leaf.bold)value=<strong>{value}</strong>;
  return <React.Fragment key={key}>{value}</React.Fragment>;
}

function renderNode(node:StudyPlateNode|StudyPlateLeaf,key:string):React.ReactNode {
  if('text' in node)return leafContent(node,key);
  const children=node.children.map((item,index)=>renderNode(item,key+'-'+index));
  switch(node.type){
    case 'h1':return <h2 key={key} className="vop-study-plate-heading">{children}</h2>;
    case 'h2':return <h3 key={key} className="vop-study-plate-subheading">{children}</h3>;
    case 'h3':return <h4 key={key} className="vop-study-plate-subheading">{children}</h4>;
    case 'blockquote':return <blockquote key={key}>{children}</blockquote>;
    case 'ul':return <ul key={key}>{children}</ul>;
    case 'ol':return <ol key={key}>{children}</ol>;
    case 'li':return <li key={key}>{children}</li>;
    case 'a':return node.url && isSafeHttpsMediaUrl(node.url)
      ? <a key={key} href={node.url} target="_blank" rel="noopener noreferrer">{children}</a>
      : <span key={key}>{children}</span>;
    case 'img':return node.url && isSafeHttpsMediaUrl(node.url)
      ? <figure key={key}><img src={node.url} alt={node.children.map(item=>'text' in item?item.text:'').join('')}
          loading="lazy"/></figure>
      : null;
    case 'code_block':return <pre key={key}><code>{node.children.map(item=>'text' in item?item.text:'').join('')}</code></pre>;
    default:return <p key={key}>{children}</p>;
  }
}

/** Read-only rendering of validated Plate JSON. No dangerouslySetInnerHTML,
 * arbitrary embedded scripts or private assessment data. */
export function StudyPlateContent({document,afterBlock}: {
  document:StudyPlateDocument;
  afterBlock?:(anchorId:string)=>React.ReactNode;
}){
  return <div className="vop-study-plate">{document.map((node,index)=><React.Fragment key={node.id||String(index)}>
    {renderNode(node,node.id||String(index))}
    {node.id&&afterBlock?.(node.id)}
  </React.Fragment>)}</div>;
}
