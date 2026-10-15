# Genera fotos sintéticas de hojas sobre mesas, con proyección 3D real y esquinas conocidas.
import cv2, numpy as np, json, math, random, sys
random.seed(int(sys.argv[4]) if len(sys.argv) > 4 else 7); np.random.seed(7)
OUT = sys.argv[2] if len(sys.argv) > 2 else '/tmp/claude-0/esc/fotos'
DIFICIL = len(sys.argv) > 3
PAPELES = {'carta': (216, 279), 'a4': (210, 297), 'oficio': (216, 330)}

def formulario(wmm, hmm, tipo):
    s = 6  # px por mm
    W, H = int(wmm*s), int(hmm*s)
    p = np.full((H, W, 3), 247, np.uint8)
    p[:] = (246 + np.random.randint(-3, 3), 247, 244 + np.random.randint(-4, 2))
    m = int(W*0.06)
    if tipo == 'tabla':  # formulario con borde grueso que casi llena la hoja (trampa para el detector)
        cv2.rectangle(p, (m, m), (W-m, H-m), (20, 20, 20), 5)
        cv2.rectangle(p, (m, m), (W-m, m+int(H*0.08)), (20, 20, 20), 4)
        y = m+int(H*0.08)
        while y < H-m-40:
            y += int(H*0.035); cv2.line(p, (m, y), (W-m, y), (40, 40, 40), 2)
        for x in (m+int(W*0.35), m+int(W*0.62)):
            cv2.line(p, (x, m+int(H*0.08)), (x, H-m), (40, 40, 40), 2)
    elif tipo == 'lineas':
        base = cv2.imread('/tmp/claude-0/pr/hoja%d.jpg' % random.choice([1, 2]))
        p = cv2.resize(base, (W, H), interpolation=cv2.INTER_AREA)
    else:  # carta escrita
        cv2.rectangle(p, (m, m), (m+int(W*0.25), m+int(H*0.06)), (150, 80, 30), -1)
    # "Letra": trazos oscuros
    for _ in range(140):
        x = random.randint(m+10, W-m-200); y = random.randint(m+int(H*0.1), H-m-20)
        L = random.randint(40, 190)
        cv2.line(p, (x, y), (x+L, y+random.randint(-2, 2)), (60, 50, 120) if random.random() < .5 else (30, 30, 30), random.randint(2, 4))
    # firma
    pts = np.array([[int(W*0.55)+i*12, int(H*0.88)+int(25*math.sin(i*0.9))] for i in range(25)], np.int32)
    cv2.polylines(p, [pts], False, (90, 40, 20), 3)
    return p

def fondo(tipo, W, H):
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    n = np.random.randn(H, W).astype(np.float32)
    if tipo == 'madera':
        g = np.sin(xx/37 + 4*np.sin(yy/180)) * 18 + cv2.GaussianBlur(n, (0, 0), 6)*25
        b = np.dstack([60+g*0.5, 105+g*0.8, 150+g]).clip(0, 255)
    elif tipo == 'oscura':
        b = np.dstack([40+n*4]*3) + np.array([5, 0, -3]); b = b.clip(0, 255)
    elif tipo == 'clara':  # mesa blanca/gris clara: caso difícil
        v = (222 if DIFICIL else 206) + cv2.GaussianBlur(n, (0, 0), 3)*6
        b = np.dstack([v+3, v, v-6]).clip(0, 255)
    elif tipo == 'beige':
        v = cv2.GaussianBlur(n, (0, 0), 2)*8
        b = np.dstack([150+v, 185+v, 205+v]).clip(0, 255)
    elif tipo == 'mantel':
        cuad = ((xx//90 + yy//90) % 2)
        b = np.dstack([cuad*120+60, cuad*60+70, cuad*30+170]) + n[..., None]*5; b = b.clip(0, 255)
    else:  # escritorio con cosas
        b = np.dstack([90+n*5, 95+n*5, 100+n*5])
        for _ in range(7):
            x, y = random.randint(0, W), random.randint(0, H); w, h = random.randint(150, 600), random.randint(100, 500)
            c = [random.randint(20, 230) for _ in range(3)]
            cv2.rectangle(b, (x, y), (x+w, y+h), c, -1)
        b = b.clip(0, 255)
    return b.astype(np.float32)

def proyectar(P, R, t, f, cx, cy):
    X = (R @ P.T).T + t
    return np.stack([f*X[:, 0]/X[:, 2] + cx, f*X[:, 1]/X[:, 2] + cy], 1)

def rot(ax, ay, az):
    cx, sx, cy_, sy, cz, sz = math.cos(ax), math.sin(ax), math.cos(ay), math.sin(ay), math.cos(az), math.sin(az)
    Rx = np.array([[1, 0, 0], [0, cx, -sx], [0, sx, cx]]); Ry = np.array([[cy_, 0, sy], [0, 1, 0], [-sy, 0, cy_]]); Rz = np.array([[cz, -sz, 0], [sz, cz, 0], [0, 0, 1]])
    return Rx @ Ry @ Rz

casos = []
FONDOS = ['madera', 'oscura', 'clara', 'beige', 'mantel', 'cosas']
N = int(sys.argv[1]) if len(sys.argv) > 1 else 36
for i in range(N):
    fondo_t = FONDOS[i % len(FONDOS)]
    papel = random.choice(list(PAPELES)); wmm, hmm = PAPELES[papel]
    tipo = random.choice(['tabla', 'lineas', 'carta'])
    vertical = random.random() < .8
    W, H = (1500, 2000) if vertical else (2000, 1500)
    f = random.uniform(0.75, 1.0) * max(W, H)
    tex = formulario(wmm, hmm, tipo)
    th, tw = tex.shape[:2]
    # hoja en el plano z=0, centrada; cámara inclinada
    P = np.array([[-wmm/2, -hmm/2, 0], [wmm/2, -hmm/2, 0], [wmm/2, hmm/2, 0], [-wmm/2, hmm/2, 0]], np.float64)
    for intento in range(200):
        ax = math.radians(random.uniform(-28, 28)); ay = math.radians(random.uniform(-18, 18))
        az = math.radians(random.uniform(-12, 12) + (0 if vertical else 90) + (180 if random.random() < .1 else 0))
        R = rot(ax, ay, az)
        cubre = random.uniform(0.45, 0.92)
        d = f * hmm / (cubre * (H if vertical else W) if vertical else cubre * W) * (1 if vertical else 1)
        d = f * max(wmm, hmm) / (cubre * max(W, H))
        t = np.array([random.uniform(-0.08, 0.08)*wmm, random.uniform(-0.08, 0.08)*hmm, d])
        q = proyectar(P, R, t, f, W/2, H/2)
        dentro = np.all((q[:, 0] > 8) & (q[:, 0] < W-8) & (q[:, 1] > 8) & (q[:, 1] < H-8))
        if dentro or ((i % 12 == 11 or (DIFICIL and i % 5 == 4)) and np.sum((q[:, 0] < 0) | (q[:, 0] > W) | (q[:, 1] < 0) | (q[:, 1] > H)) == 1):
            break
    src = np.float32([[0, 0], [tw, 0], [tw, th], [0, th]])
    Hm = cv2.getPerspectiveTransform(src, q.astype(np.float32))
    img = fondo(fondo_t, W, H)
    # sombra suave de la hoja sobre la mesa
    mask = cv2.warpPerspective(np.full((th, tw), 255, np.uint8), Hm, (W, H)).astype(np.float32)/255
    som = cv2.GaussianBlur(np.roll(np.roll(mask, 6, 0), 4, 1), (0, 0), 6)
    img *= (1 - 0.25*som)[..., None]
    warp = cv2.warpPerspective(tex.astype(np.float32), Hm, (W, H), flags=cv2.INTER_AREA)
    img = img*(1-mask[..., None]) + warp*mask[..., None]
    # luz: degradado + viñeta; a veces sombra de mano/teléfono y a veces brillo de flash
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    ang = random.uniform(0, 6.28)
    grad = 1 + 0.18*((xx/W-0.5)*math.cos(ang) + (yy/H-0.5)*math.sin(ang))
    vig = 1 - 0.25*(((xx-W/2)/W)**2 + ((yy-H/2)/H)**2)*2
    img *= (grad*vig)[..., None]
    extra = []
    if random.random() < .35:
        extra.append('sombra')
        s = np.zeros((H, W), np.float32)
        cx_, cy_ = random.randint(0, W), random.randint(0, H)
        cv2.ellipse(s, (cx_, cy_), (random.randint(300, 700), random.randint(200, 500)), random.randint(0, 180), 0, 360, 1, -1)
        s = cv2.GaussianBlur(s, (0, 0), 60)
        img *= (1 - 0.4*s)[..., None]
    if random.random() < .25:
        extra.append('flash')
        cx_, cy_ = W/2 + random.uniform(-200, 200), H/2 + random.uniform(-200, 200)
        r = np.exp(-(((xx-cx_)**2 + (yy-cy_)**2) / (2*(random.uniform(150, 350))**2)))
        img += (r*90)[..., None]
    if DIFICIL:
        r = random.random()
        if r < .25:  # mano sujetando la hoja por un borde
            extra.append('mano')
            k = random.randint(0, 3); a, b = q[k], q[(k+1) % 4]; t_ = random.uniform(.3, .7); px, py = a + (b-a)*t_
            m2 = np.zeros((H, W), np.float32)
            cv2.ellipse(m2, (int(px), int(py)), (random.randint(70, 110), random.randint(160, 230)), random.randint(0, 180), 0, 360, 1, -1)
            m2 = cv2.GaussianBlur(m2, (0, 0), 3)[..., None]
            img = img*(1-m2) + np.array([110, 150, 205], np.float32)*m2
        elif r < .45:  # otra hoja blanca al lado, tocándola
            extra.append('otra')
            k = random.randint(0, 3); a, b = q[k], q[(k+1) % 4]; n_ = np.array([b[1]-a[1], a[0]-b[0]]); n_ = n_/np.linalg.norm(n_)
            c0 = (a+b)/2; poly = np.array([a + n_*5 + (b-a)*0.2, b + n_*5 - (b-a)*0.1, b + n_*random.uniform(150, 400), a + n_*random.uniform(150, 400)], np.int32)
            ctr = q.mean(0)
            if np.dot(c0 - ctr, n_) < 0: poly = np.array([a - n_*5 + (b-a)*0.2, b - n_*5 - (b-a)*0.1, b - n_*random.uniform(150, 400), a - n_*random.uniform(150, 400)], np.int32)
            m2 = np.zeros((H, W), np.uint8); cv2.fillPoly(m2, [poly], 255); m2 = (m2 > 0) & (mask < 0.5)
            img[m2] = img[m2]*0.1 + np.array([235, 238, 240])*0.9
        elif r < .6:  # poca luz
            extra.append('oscuro'); img *= 0.45; img += np.random.randn(H, W, 1)*9
        elif r < .75:  # foto movida
            extra.append('movida'); L_ = random.randint(9, 17); ker = np.zeros((L_, L_), np.float32); ker[L_//2, :] = 1/L_
            M_ = cv2.getRotationMatrix2D((L_/2, L_/2), random.uniform(0, 180), 1); ker = cv2.warpAffine(ker, M_, (L_, L_)); ker /= ker.sum()
            img = cv2.filter2D(img, -1, ker)
    img = img.clip(0, 255)
    img = cv2.GaussianBlur(img, (0, 0), random.uniform(0.4, 1.6))
    img += np.random.randn(H, W, 1)*random.uniform(2, 6)
    img = img.clip(0, 255).astype(np.uint8)
    nombre = '%02d.jpg' % i
    cv2.imwrite(f'{OUT}/{nombre}', img, [cv2.IMWRITE_JPEG_QUALITY, 88])
    casos.append({'archivo': nombre, 'fondo': fondo_t, 'papel': papel, 'tipo': tipo, 'extra': extra, 'esquinas': q.round(2).tolist(), 'proporcion': hmm/wmm, 'f': f, 'w': W, 'h': H})
json.dump(casos, open(f'{OUT}/verdad.json', 'w'), indent=1)
print(len(casos), 'fotos')
