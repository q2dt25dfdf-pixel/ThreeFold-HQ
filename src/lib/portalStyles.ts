export const PORTAL_STYLES = `
  .portal-outer {
    margin: 0 auto;
    padding: 48px 20px 80px;
    box-sizing: border-box;
  }
  .col-rule {
    height: 1px;
    background-color: rgba(255,255,255,0.09);
    margin: 36px 0;
  }
  @media (min-width: 768px) {
    .portal-outer { max-width: 1000px; padding-left: 40px; padding-right: 40px; }
  }
  @media (min-width: 1024px) {
    .portal-outer { max-width: 1440px; padding-left: 80px; padding-right: 80px; padding-top: 64px; }
    .portal-columns {
      display: grid;
      grid-template-columns: minmax(0, 1.25fr) minmax(0, 1fr);
      gap: 0 88px;
      align-items: start;
    }
  }
  @media (max-width: 1023px) {
    .portal-col-side {
      border-top: 1px solid rgba(255,255,255,0.09);
      margin-top: 40px;
      padding-top: 40px;
    }
  }
`;
