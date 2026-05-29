import { Router } from 'express';
import sql from '../db.js';
import { authMiddleware } from '../middleware/auth.js';
import * as XLSX from 'xlsx';
import multer from 'multer';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

// 목록 조회 (현재 입주자 포함)
router.get('/', authMiddleware, async (req, res) => {
  const list = await sql`
    SELECT h.*,
      r.id as resident_id, r.emp_no, r.emp_name, r.org_name as resident_org,
      r.move_in_date, r.move_out_date, r.note as resident_note
    FROM housing h
    LEFT JOIN housing_residents r ON r.housing_id = h.id AND r.move_out_date IS NULL
    ORDER BY h.org_name, h.address
  `;
  res.json(list);
});

// 통계 (반드시 /:id 보다 앞에)
router.get('/stats/summary', authMiddleware, async (req, res) => {
  const [total] = await sql`SELECT COUNT(*) as cnt FROM housing`;
  const [occupied] = await sql`SELECT COUNT(*) as cnt FROM housing_residents WHERE move_out_date IS NULL`;
  const [expiring] = await sql`
    SELECT COUNT(*) as cnt FROM housing
    WHERE contract_end IS NOT NULL
    AND contract_end::date BETWEEN CURRENT_DATE AND CURRENT_DATE + 30
  `;
  res.json({
    total: Number(total.cnt),
    occupied: Number(occupied.cnt),
    vacant: Number(total.cnt) - Number(occupied.cnt),
    expiring: Number(expiring.cnt),
  });
});

// 신청 카운트 (홈화면용)
router.get('/pending-count', authMiddleware, async (req, res) => {
  const [row] = await sql`SELECT COUNT(*) as cnt FROM housing_residents WHERE move_out_date IS NULL`;
  res.json({ count: Number(row.cnt) });
});

// 거리 계산 (네이버 Directions API)
router.post('/check-distance', authMiddleware, async (req, res) => {
  try {
    const { home_address, office_id } = req.body;
    const [office] = await sql`SELECT address FROM offices WHERE id=${office_id}`;
    if (!office) return res.status(404).json({ error: '사무실 없음' });

    const CLIENT_ID = process.env.NAVER_CLIENT_ID;
    const CLIENT_SECRET = process.env.NAVER_CLIENT_SECRET;
    if (!CLIENT_ID || !CLIENT_SECRET) return res.status(500).json({ error: 'API 키 미설정' });

    async function geocode(addr) {
      const r = await fetch(`https://naveropenapi.apigw.ntruss.com/map-geocode/v2/geocode?query=${encodeURIComponent(addr)}`, {
        headers: { 'X-NCP-APIGW-API-KEY-ID': CLIENT_ID, 'X-NCP-APIGW-API-KEY': CLIENT_SECRET }
      });
      const d = await r.json();
      const loc = d.addresses?.[0];
      if (!loc) throw new Error(`주소 검색 실패: ${addr}`);
      return { lng: loc.x, lat: loc.y };
    }

    const [home, work] = await Promise.all([geocode(home_address), geocode(office.address)]);
    const start = `${home.lng},${home.lat}`;
    const goal = `${work.lng},${work.lat}`;

    const dr = await fetch(`https://naveropenapi.apigw.ntruss.com/map-direction/v1/driving?start=${start}&goal=${goal}&option=trafast`, {
      headers: { 'X-NCP-APIGW-API-KEY-ID': CLIENT_ID, 'X-NCP-APIGW-API-KEY': CLIENT_SECRET }
    });
    const dd = await dr.json();
    const meters = dd.route?.trafast?.[0]?.summary?.distance;
    if (!meters) return res.status(400).json({ error: '경로 계산 실패' });

    const km = Math.round(meters / 100) / 10;
    res.json({ distance_km: km, eligible: km >= 50, home_address, office_address: office.address });
  } catch(e) {
    console.error('check-distance error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// 단건 조회 (이력 포함)
router.get('/:id', authMiddleware, async (req, res) => {
  const [h] = await sql`SELECT * FROM housing WHERE id=${req.params.id}`;
  if (!h) return res.status(404).json({ error: '없음' });
  const residents = await sql`
    SELECT * FROM housing_residents WHERE housing_id=${req.params.id} ORDER BY move_in_date DESC
  `;
  res.json({ ...h, residents });
});

// 사택 등록
router.post('/', authMiddleware, async (req, res) => {
  const d = req.body;
  const [h] = await sql`
    INSERT INTO housing (address, area_sqm, org_name, rent_type, deposit, monthly_rent,
      rent_day, payment_type, auto_renew_years, contract_start, initial_end, contract_end, note)
    VALUES (${d.address}, ${d.area_sqm||null}, ${d.org_name||null}, ${d.rent_type||null},
      ${d.deposit||null}, ${d.monthly_rent||null}, ${d.rent_day||null}, ${d.payment_type||null},
      ${d.auto_renew_years||null}, ${d.contract_start||null}, ${d.initial_end||null},
      ${d.contract_end||null}, ${d.note||null})
    RETURNING *
  `;
  res.status(201).json(h);
});

// 사택 수정
router.patch('/:id', authMiddleware, async (req, res) => {
  const d = req.body;
  const [h] = await sql`
    UPDATE housing SET
      address=${d.address}, area_sqm=${d.area_sqm||null}, org_name=${d.org_name||null},
      rent_type=${d.rent_type||null}, deposit=${d.deposit||null}, monthly_rent=${d.monthly_rent||null},
      rent_day=${d.rent_day||null}, payment_type=${d.payment_type||null},
      auto_renew_years=${d.auto_renew_years||null}, contract_start=${d.contract_start||null},
      initial_end=${d.initial_end||null}, contract_end=${d.contract_end||null},
      note=${d.note||null}, special_note=${d.special_note !== undefined ? d.special_note : null}, updated_at=NOW()
    WHERE id=${req.params.id} RETURNING *
  `;
  res.json(h);
});

// 사택 삭제
router.delete('/:id', authMiddleware, async (req, res) => {
  await sql`DELETE FROM housing WHERE id=${req.params.id}`;
  res.json({ ok: true });
});

// 입주자 등록
router.post('/:id/residents', authMiddleware, async (req, res) => {
  const { emp_no, emp_name, org_name, move_in_date, note } = req.body;
  // 기존 입주자 퇴거 처리
  await sql`
    UPDATE housing_residents SET move_out_date=${move_in_date}
    WHERE housing_id=${req.params.id} AND move_out_date IS NULL
  `;
  const [r] = await sql`
    INSERT INTO housing_residents (housing_id, emp_no, emp_name, org_name, move_in_date, note)
    VALUES (${req.params.id}, ${emp_no}, ${emp_name}, ${org_name||null}, ${move_in_date}, ${note||null})
    RETURNING *
  `;
  res.status(201).json(r);
});

// 임차종료
router.patch('/:id/terminate', authMiddleware, async (req, res) => {
  const { terminate_date } = req.body;
  const [h] = await sql`
    UPDATE housing SET contract_end=${terminate_date}, updated_at=NOW()
    WHERE id=${req.params.id} RETURNING *
  `;
  // 입주자 퇴거 처리
  await sql`
    UPDATE housing_residents SET move_out_date=${terminate_date}
    WHERE housing_id=${req.params.id} AND move_out_date IS NULL
  `;
  res.json(h);
});

// 퇴거 처리
router.patch('/:id/residents/:rid/checkout', authMiddleware, async (req, res) => {
  const { move_out_date } = req.body;
  const [r] = await sql`
    UPDATE housing_residents SET move_out_date=${move_out_date}
    WHERE id=${req.params.rid} RETURNING *
  `;
  res.json(r);
});

// 양식 다운로드
router.get('/template/excel', authMiddleware, (req, res) => {
  const wb = XLSX.utils.book_new();
  const headers = [['소속(센터)','사택주소','전용평수','계약시작일','최초종료일','현재종료일','자동갱신(년)','구분(월세/연세)','보증금(만원)','월세연세(만원)','지급일(1-31)','지급시기(선불/후불)','사번','성명','입주일','비고']];
  const example = [['강남보상센터','서울시 서초구 서초대로 456','24.5','2024-01-01','2025-12-31','2025-12-31',2,'월세',3000,50,25,'후불','11500001','홍길동','2024-01-01','']];
  const ws = XLSX.utils.aoa_to_sheet([...headers, ...example]);
  ws['!cols'] = [14,30,8,12,12,12,10,12,10,12,8,12,10,8,12,15].map(w => ({ wch: w }));
  XLSX.utils.book_append_sheet(wb, ws, '사택등록');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Disposition', 'attachment; filename=HR노트_사택등록양식.xlsx');
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.send(buf);
});

// 엑셀 업로드
router.post('/upload/excel', authMiddleware, upload.single('file'), async (req, res) => {
  try {
    const wb = XLSX.read(req.file.buffer, { type: 'buffer', cellDates: true });
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });
    let success = 0, errors = [];

    const parseDate = (v) => {
      if (!v) return null;
      if (v instanceof Date) return v.toISOString().split('T')[0];
      if (typeof v === 'number') return new Date((v - 25569) * 86400 * 1000).toISOString().split('T')[0];
      return String(v).trim() || null;
    };
    const str = (v) => String(v || '').trim() || null;

    for (const r of rows) {
      const address = str(r['사택주소']);
      if (!address) continue;
      try {
        // 사택 upsert (주소 기준)
        let [h] = await sql`SELECT id FROM housing WHERE address=${address}`;
        if (!h) {
          [h] = await sql`
            INSERT INTO housing (address, area_sqm, org_name, rent_type, deposit, monthly_rent,
              rent_day, payment_type, auto_renew_years, contract_start, initial_end, contract_end)
            VALUES (${address}, ${str(r['전용평수'])}, ${str(r['소속(센터)'])},
              ${str(r['구분(월세/연세)'])}, ${str(r['보증금(만원)'])}, ${str(r['월세연세(만원)'])},
              ${str(r['지급일(1-31)'])}, ${str(r['지급시기(선불/후불)'])}, ${str(r['자동갱신(년)'])},
              ${parseDate(r['계약시작일'])}, ${parseDate(r['최초종료일'])}, ${parseDate(r['현재종료일'])})
            RETURNING *
          `;
        } else {
          await sql`
            UPDATE housing SET
              area_sqm=${str(r['전용평수'])}, org_name=${str(r['소속(센터)'])},
              rent_type=${str(r['구분(월세/연세)'])}, deposit=${str(r['보증금(만원)'])},
              monthly_rent=${str(r['월세연세(만원)'])}, rent_day=${str(r['지급일(1-31)'])},
              payment_type=${str(r['지급시기(선불/후불)'])}, auto_renew_years=${str(r['자동갱신(년)'])},
              contract_start=${parseDate(r['계약시작일'])}, initial_end=${parseDate(r['최초종료일'])},
              contract_end=${parseDate(r['현재종료일'])}, updated_at=NOW()
            WHERE id=${h.id}
          `;
        }
        // 입주자 등록
        const emp_no = str(r['사번']);
        const emp_name = str(r['성명']);
        const move_in = parseDate(r['입주일']);
        if (emp_no && emp_name && move_in) {
          const [existing] = await sql`
            SELECT id FROM housing_residents WHERE housing_id=${h.id} AND move_out_date IS NULL
          `;
          if (!existing) {
            await sql`
              INSERT INTO housing_residents (housing_id, emp_no, emp_name, org_name, move_in_date, note)
              VALUES (${h.id}, ${emp_no}, ${emp_name}, ${str(r['소속(센터)'])}, ${move_in}, ${str(r['비고'])})
            `;
          }
        }
        success++;
      } catch(e) { errors.push(e.message); }
    }
    res.json({ success, errors, total: rows.length });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
