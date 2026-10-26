# LocalBackup — Office web server

เว็บที่รันบน Windows Server ในสำนักงาน (IIS) และเผยแพร่ที่ **https://server.re-loader.com**

## โครงสร้าง

```
www/        ← ไฟล์เว็บทั้งหมด (HTML/CSS/JS/รูป)  → ถูกคัดลอกไป C:\inetpub\wwwroot
deploy/     ← สคริปต์ deploy บนเซิร์ฟเวอร์
```

## วิธีอัปเดตเว็บ (จากที่ไหนก็ได้)

1. แก้ไฟล์ใน `www/`
2. `git add . && git commit -m "update" && git push`
3. รอไม่เกิน 5 นาที เซิร์ฟเวอร์จะดึงลงไปเอง

หรือแก้ไฟล์ตรง ๆ บน GitHub.com แล้วกด Commit ก็ได้ (ใช้จากมือถือได้)

## ติดตั้งครั้งแรกบนเซิร์ฟเวอร์

เปิด PowerShell (Admin) บน 192.168.1.99 แล้วรัน:

```powershell
irm https://raw.githubusercontent.com/re-loader/LocalBackup/main/deploy/setup-server.ps1 | iex
```

ครั้งแรก Git จะเปิดหน้าล็อกอิน GitHub ให้ยืนยันหนึ่งครั้ง หลังจากนั้นไม่ต้องล็อกอินอีก

## ตรวจสอบ

- Log การ deploy: `C:\web-repo\deploy.log`
- ดูสถานะ task: `Get-ScheduledTask web-deploy`
- บังคับ deploy ทันที: `Start-ScheduledTask web-deploy`
