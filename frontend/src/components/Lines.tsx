import { Fragment } from 'react';

/** Renders a translated string with "\n" as <br /> (no dangerouslySetInnerHTML). */
export default function Lines({ text }: { text: string }) {
  const parts = text.split('\n');
  return (
    <>
      {parts.map((part, i) => (
        <Fragment key={i}>
          {i > 0 && <br />}
          {part}
        </Fragment>
      ))}
    </>
  );
}
