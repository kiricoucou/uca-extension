"""Page appli.html : le QR code est cliquable, il s'ouvre en grand (croix, Échap, clic à côté ferment). Usage : python -I -X utf8 tests/qr_agrandi.py"""
import subprocess,sys,socket
from playwright.sync_api import sync_playwright
s=socket.socket();s.bind(("127.0.0.1",0));port=s.getsockname()[1];s.close()
srv=subprocess.Popen([sys.executable,"-m","http.server",str(port),"--bind","127.0.0.1","--directory",str(__import__("pathlib").Path(__file__).resolve().parent.parent)],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
try:
  with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(viewport={"width":1280,"height":800}); err=[]
    pg.on("pageerror",lambda e:err.append(str(e)))
    pg.goto(f"http://127.0.0.1:{port}/appli.html"); pg.wait_for_timeout(800)
    big=pg.locator("#qrBig")
    r=[]
    r.append(("fermé au départ","open" not in big.get_attribute("class")))
    pg.click("#qr"); pg.wait_for_timeout(200)
    r.append(("clic ouvre",("open" in big.get_attribute("class")) and big.locator("svg").count()==1))
    bb=pg.locator("#qrBigImg").bounding_box(); r.append(("grand",bb["width"]>300))
    pg.keyboard.press("Escape"); r.append(("Échap ferme","open" not in big.get_attribute("class")))
    pg.click("#qr"); pg.click("#qrClose"); r.append(("croix ferme","open" not in big.get_attribute("class")))
    pg.click("#qr"); pg.mouse.click(5,5); r.append(("clic fond ferme","open" not in big.get_attribute("class")))
    
    r.append(("aucune erreur",not err))
    for n,o in r: print("PASS" if o else "FAIL",n)
    b.close()
finally: srv.terminate()
