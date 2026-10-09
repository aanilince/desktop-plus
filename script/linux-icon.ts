import { join } from 'path'

// Icon is named "gh-pickaxe" rather than "pickaxe" to avoid the freedesktop dash-stripping fallback
// ('desktop' exists in many icon themes, so that icon would be used instead of ours).
export const LINUX_ICON_NAME = 'gh-pickaxe'

// electron-installer-common derives the installed hicolor icon filename from the
// package name (`appIdentifier`, which is just `options.name`). We want the icons
// to land under LINUX_ICON_NAME, while everything else (paths, binary, .desktop
// filename) keeps reading the real package name.
export function overrideHicolorIconName(Installer: any): () => void {
  const original = Installer.prototype.copyHicolorIcons
  Installer.prototype.copyHicolorIcons = async function (this: any) {
    const icons: Record<string, string> = this.options.icon || {}
    await Promise.all(
      Object.entries(icons).map(([resolution, iconSrc]) => {
        const iconExt = ['scalable', 'symbolic'].includes(resolution)
          ? 'svg'
          : 'png'
        const iconName =
          resolution === 'symbolic'
            ? `${LINUX_ICON_NAME}-symbolic`
            : LINUX_ICON_NAME
        const iconFile = join(
          this.stagingDir,
          this.baseAppDir,
          'share',
          'icons',
          'hicolor',
          resolution,
          'apps',
          `${iconName}.${iconExt}`
        )
        return this.copyIcon(iconSrc, iconFile)
      })
    )
  }
  return () => {
    Installer.prototype.copyHicolorIcons = original
  }
}
