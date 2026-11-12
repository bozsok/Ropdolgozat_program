const presenceService = require('../src/services/presenceService');
const assert = require('assert');

console.log('--- 1. presenceService alapteszt ---');

// 1. Első gép lefoglalja a diák 1-et
const res1 = presenceService.claimSeat('socket-1', {
  className: '6.a',
  studentId: '101',
  studentName: 'Teszt Diák 1',
  pcNumber: 1
});
assert.strictEqual(res1.success, true);
assert.ok(res1.occupiedStudentIds.includes('101'));
console.log('✓ Első foglalás sikeres:', res1);

// 2. Második gép megpróbálja ugyanazt a diákot lefoglalni -> SIKERTELEN kell legyen
const res2 = presenceService.claimSeat('socket-2', {
  className: '6.a',
  studentId: '101',
  studentName: 'Teszt Diák 1',
  pcNumber: 2
});
assert.strictEqual(res2.success, false);
console.log('✓ Második foglalás azonos diákra helyesen elutasítva:', res2.message);

// 3. Második gép másik diákot foglal le -> SIKERES
const res3 = presenceService.claimSeat('socket-2', {
  className: '6.a',
  studentId: '102',
  studentName: 'Teszt Diák 2',
  pcNumber: 2
});
assert.strictEqual(res3.success, true);
assert.ok(res3.occupiedStudentIds.includes('101'));
assert.ok(res3.occupiedStudentIds.includes('102'));
console.log('✓ Második gép más diákot sikeresen lefoglalt:', res3.occupiedStudentIds);

// 4. Első gép feloldja a foglalását (releaseSeat)
const rel1 = presenceService.releaseSeat('socket-1');
assert.ok(!rel1.occupiedStudentIds.includes('101'));
assert.ok(rel1.occupiedStudentIds.includes('102'));
console.log('✓ Első gép feloldása sikeres, 101 felszabadult:', rel1.occupiedStudentIds);

// 5. Második gép kapcsolatbontása (releaseSeat)
const rel2 = presenceService.releaseSeat('socket-2');
assert.ok(!rel2.occupiedStudentIds.includes('102'));
console.log('✓ Második gép feloldása sikeres, minden foglalás felszabadult:', rel2.occupiedStudentIds);

console.log('🎉 MINDEN PRESENCE TESZT HIBÁTLANUL LEFUTOTT!');

