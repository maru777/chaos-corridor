def sub(p, a, b, cnt=1):
    s = open(p, encoding='utf-8').read()
    assert a in s, (p, a[:60])
    open(p, 'w', encoding='utf-8').write(s.replace(a, b, cnt))


p = 'src/view/layout.ts'
sub(p, "export function cameraRig(aspect: number, size = 9, safeOverride?: SafeArea): CameraRig {", "export function cameraRig(aspect: number, size = 9, safeOverride?: SafeArea, pitchOverrideDeg?: number): CameraRig {")
sub(p, "  const pitch = ((aspect < 1 ? 70 : 62) * Math.PI) / 180;", "  const pitch = ((pitchOverrideDeg ?? (aspect < 1 ? 70 : 62)) * Math.PI) / 180;")
p = 'src/view/board3d.ts'
sub(p, "    const rig = cameraRig(this.camera.aspect, this.size, safe);", "    // 確認用: URL に ?top を付けると、ほぼ真上から見て、盤が正方形に見える（88 度。真上の 90 度は、向きが決まらないので避ける）\n    const pitch = new URLSearchParams(location.search).has('top') ? 88 : undefined;\n    const rig = cameraRig(this.camera.aspect, this.size, safe, pitch);")
