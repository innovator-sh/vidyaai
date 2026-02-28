import { useEffect, useRef } from 'react';
import mermaid from 'mermaid';

interface MermaidDiagramProps {
  chart: string;
}

import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch";
import { MagnifyingGlassPlus, MagnifyingGlassMinus, ArrowsOutSimple } from "phosphor-react";

export default function MermaidDiagram({ chart }: MermaidDiagramProps) {
  const mermaidRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    mermaid.initialize({
      startOnLoad: false,
      theme: 'default',
      securityLevel: 'loose',
      fontFamily: 'Sora, sans-serif',
    });
  }, []);

  useEffect(() => {
    let isMounted = true;

    const renderChart = async () => {
      if (!mermaidRef.current || !chart) return;

      try {
        const id = `mermaid-chart-${Math.random().toString(36).substring(2, 9)}`;
        const { svg } = await mermaid.render(id, chart);

        if (isMounted && mermaidRef.current) {
          mermaidRef.current.innerHTML = svg;
        }
      } catch (error) {
        console.error('Mermaid render error:', error);
        if (isMounted && mermaidRef.current) {
          mermaidRef.current.innerHTML = `<div style="color:#ef4444; padding:10px; border:1px solid #ef4444; border-radius:8px; margin-bottom:10px;"><b>Flowchart Error:</b> Could not render the generated chart. Try generating it again!</div><pre style="white-space:pre-wrap; font-size:12px; opacity:0.7;">${chart}</pre>`;
        }
      }
    };

    renderChart();

    return () => { isMounted = false; };
  }, [chart]);

  return (
    <div className="mermaid-container" style={{ width: '100%', height: '100%', position: 'relative', border: '1px solid #eee', borderRadius: '12px', overflow: 'hidden', background: '#fcfcfc' }}>
      <TransformWrapper
        initialScale={1}
        minScale={0.5}
        maxScale={4}
        centerOnInit={true}
      >
        {({ zoomIn, zoomOut, resetTransform }) => (
          <>
            <div style={{ position: 'absolute', top: 10, right: 10, zIndex: 10, display: 'flex', gap: '8px', background: 'white', padding: '6px', borderRadius: '8px', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>
              <button onClick={() => zoomIn()} title="Zoom In" style={{ border: 'none', background: '#f0f0f0', borderRadius: '6px', padding: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <MagnifyingGlassPlus size={18} weight="bold" />
              </button>
              <button onClick={() => zoomOut()} title="Zoom Out" style={{ border: 'none', background: '#f0f0f0', borderRadius: '6px', padding: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <MagnifyingGlassMinus size={18} weight="bold" />
              </button>
              <button onClick={() => resetTransform()} title="Reset Zoom" style={{ border: 'none', background: '#f0f0f0', borderRadius: '6px', padding: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <ArrowsOutSimple size={18} weight="bold" />
              </button>
            </div>
            <TransformComponent wrapperStyle={{ width: '100%', height: '100%', minHeight: '400px' }}>
              <div ref={mermaidRef} className="mermaid" style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px' }} />
            </TransformComponent>
          </>
        )}
      </TransformWrapper>
    </div>
  );
}
