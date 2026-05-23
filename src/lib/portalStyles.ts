export const PORTAL_STYLES = `
  .portal-outer {
    margin: 0 auto;
    padding: 64px 24px 96px;
    box-sizing: border-box;
  }
  .col-rule {
    height: 1px;
    background-color: #DDD6CB;
    margin: 36px 0;
  }
  @media (min-width: 768px) {
    .portal-outer { max-width: 900px; padding-left: 48px; padding-right: 48px; }
  }
  @media (min-width: 1024px) {
    .portal-outer { max-width: 1200px; padding-left: 64px; padding-right: 64px; }
    .portal-columns {
      display: grid;
      grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr);
      gap: 0 72px;
      align-items: start;
    }
  }
  @media (max-width: 1023px) {
    .portal-col-side {
      border-top: 1px solid #DDD6CB;
      margin-top: 36px;
      padding-top: 36px;
    }
  }
`;
