import importlib.util,pathlib,unittest,datetime as dt
from unittest.mock import patch
spec=importlib.util.spec_from_file_location('refresh',pathlib.Path(__file__).resolve().parents[1]/'scripts/refresh_data.py');module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
class RefreshTests(unittest.TestCase):
 def setUp(self):
  self.end=dt.datetime(2026,10,30,12,0,tzinfo=dt.timezone.utc)
  self.location={'latitude':-37.81,'longitude':144.96,'location_id':3,'status':'A','sensor_description':'Test fixture'}
 def row(self,n,t='2026-10-30T11:50:00+00:00'):
  return {'location_id':3,'sensing_datetime':t,'total_of_directions':n}
 def run_refresh(self,rows):
  with patch.object(module,'now',return_value=self.end),patch.object(module,'api',side_effect=[[self.location],rows]),patch.object(module,'save') as save:
   module.pedestrian();return save.call_args.args[1]
 def test_duplicate_minute_not_double_counted(self):
  d=self.run_refresh([self.row(5),self.row(5)]);self.assertEqual(d['sensors'][0]['count'],5);self.assertEqual(d['sensors'][0]['reportingMinutes'],1);self.assertEqual(d['duplicatesRemoved'],1)
 def test_conflicting_duplicate_excluded(self):
  d=self.run_refresh([self.row(5),self.row(7),self.row(2,'2026-10-30T11:51:00+00:00')]);self.assertEqual(d['sensors'][0]['count'],2);self.assertEqual(d['conflictsExcluded'],1)
 def test_future_negative_and_old_rows_excluded(self):
  d=self.run_refresh([self.row(-2),self.row(3,'2026-10-31T11:50:00+00:00'),self.row(9,'2026-10-29T11:50:00+00:00'),self.row(0,'2026-10-30T11:51:00+00:00')]);self.assertEqual(d['sensors'][0]['count'],0);self.assertEqual(d['rejected'],3)
 def test_empty_source_never_overwrites_previous_snapshot(self):
  with patch.object(module,'now',return_value=self.end),patch.object(module,'api',side_effect=[[self.location],[]]),patch.object(module,'save') as save:
   with self.assertRaises(RuntimeError):module.pedestrian()
   save.assert_not_called()
if __name__=='__main__':unittest.main()
