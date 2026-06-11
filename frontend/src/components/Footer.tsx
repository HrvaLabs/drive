interface Props {
  onPrivacy: () => void;
}

export default function Footer({ onPrivacy }: Props) {
  return (
    <footer className="footer no-print">
      <span className="footer__copy">© 2026 drive.hrva.cc · A HrvaLabs.net project · All rights reserved</span>
      <button className="footer__link" onClick={onPrivacy}>Privacy</button>
    </footer>
  );
}
