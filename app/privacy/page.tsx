import Link from "next/link";

export const metadata = {
  title: "隐私说明 · Dawn Reader",
  description: "Dawn Reader 如何处理账号、书籍、阅读进度和 AI 辅助数据。",
};

export default function PrivacyPage() {
  return <main className="privacy-page">
    <nav aria-label="隐私说明导航"><Link href="/">← Dawn Reader</Link></nav>
    <article>
      <p className="privacy-kicker">PRIVACY · BETA</p>
      <h1>你的书和阅读记录如何被处理</h1>
      <p className="privacy-lead">Dawn Reader 以原文阅读为中心，只收集提供书架、同步和你主动请求的阅读辅助所必需的数据。</p>

      <h2>登录身份</h2>
      <p>使用 ChatGPT 登录时，OpenAI 会把基本资料（例如姓名、邮箱和账号标识）提供给 Dawn Reader 完成登录。当前 Dawn 数据表使用账号标识隔离每位读者的数据，不保存姓名或邮箱字段。</p>

      <h2>云端书架</h2>
      <p>你主动导入的 EPUB 会保存在 Dawn 的私有对象存储中；书名、文件信息、阅读位置、设置和已配对设备保存在数据库中。每次读取都按当前账号或已配对设备授权检查，其他读者不能访问。</p>
      <p>PDF 当前只保存在导入它的浏览器本机，不会自动上传。清除浏览器站点数据可能同时清除本机 PDF、PDF 位置和高亮，因此站点数据不是文件备份。</p>

      <h2>AI 阅读辅助</h2>
      <p>只有当你主动请求解释或提问时，Dawn 才会把所选文字、有限的附近原文、书名和问题发送给当前配置的 AI 服务商。Dawn 不会默认发送整本书。需要外部资料时，搜索词可能发送给 Brave Search；未配置时使用 Wikipedia 的公开搜索接口。书架中的 AI 状态会显示当前服务商。</p>

      <h2>本机阅读证据</h2>
      <p>“查阅记录”、PDF 高亮和部分阅读设置目前保存在设备本机，不会自动同步到其他设备。它们用于帮助你回到实际读过的位置，不代表理解程度。</p>

      <h2>删除与保留</h2>
      <p>从书架删除云端 EPUB 时，Dawn 会删除对应文件、书籍记录和阅读进度，并保留一条不含书籍正文的删除屏障，防止离线旧设备把它重新上传。你可以在设备同步菜单中撤销设备访问。</p>
      <p>Dawn 仍处于 Beta。完整账号级导出和一键删除正在加入首位外部用户门禁；在它们完成前，不要把 Dawn 当作唯一备份，也不要导入无法重新取得的材料。</p>

      <h2>运营数据与第三方</h2>
      <p>Dawn 当前没有加入产品行为分析 SDK。Sites 托管、网络基础设施、登录、AI 和搜索服务仍可能按各自政策处理请求日志与必要的运行元数据。Dawn 的应用日志不应记录书籍正文、设备令牌或 API 密钥。</p>

      <h2>问题与报告</h2>
      <p>一般问题可通过 <a href="https://github.com/zhangboy03/dawn-reader/issues/new/choose">GitHub Issue</a> 提交，请勿粘贴私人原文、令牌或阅读记录。安全问题请使用仓库的 <a href="https://github.com/zhangboy03/dawn-reader/security/policy">私密漏洞报告渠道</a>。</p>

      <p className="privacy-updated">最后更新：2026-08-21</p>
    </article>
  </main>;
}
