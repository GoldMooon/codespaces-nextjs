import styles from '../../styles/components/Footer.module.css'

export default function Footer() {
  return (
    <footer className={styles.footer}>
      <div className={styles.container}>
        <p className={styles.text}>
          📖 AI 동화책 | AI-powered children's book generator
        </p>
        <p className={styles.copyright}>
          © {new Date().getFullYear()} AI Fairy Tale. All rights reserved.
        </p>
      </div>
    </footer>
  )
}