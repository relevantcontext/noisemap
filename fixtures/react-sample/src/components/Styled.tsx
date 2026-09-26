import styled from 'styled-components';

const Card = styled.div`
  padding: 16px;
  /* rounded */
  border-radius: 4px;
`;

export function Styled() {
  const html = `<p>Hello <b>world</b></p>`;
  return <Card dangerouslySetInnerHTML={{ __html: html }} />;
}
