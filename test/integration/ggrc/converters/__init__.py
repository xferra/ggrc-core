# Copyright (C) 2017 Google Inc.
# Licensed under http://www.apache.org/licenses/LICENSE-2.0 <see LICENSE file>

from flask import json
from flask import g
from os.path import abspath
from os.path import dirname
from os.path import join

from integration import ggrc
from integration.ggrc.api_helper import Api


THIS_ABS_PATH = abspath(dirname(__file__))


class TestCase(ggrc.TestCase):

  CSV_DIR = join(THIS_ABS_PATH, "test_csvs/")

  @classmethod
  def _import_file(cls, filename, dry_run=False, person=None):
    data = {"file": (open(join(cls.CSV_DIR, filename)), filename)}
    headers = {
        "X-test-only": "true" if dry_run else "false",
        "X-requested-by": "gGRC",
    }
    api = Api()
    api.set_user(person)  # Ok if person is None
    response = api.tc.post("/_service/import_csv", data=data, headers=headers)

    return json.loads(response.data)

  def import_file(self, filename, dry_run=False, person=None):
    if dry_run:
      return self._import_file(filename, dry_run=True, person=person)
    else:
      response_dry = self._import_file(filename, dry_run=True, person=person)
      response = self._import_file(filename, person=person)
      self.assertEqual(response_dry, response)
      return response

  def export_csv(self, data):
    headers = {
        'Content-Type': 'application/json',
        "X-requested-by": "gGRC",
        "X-export-view": "blocks",
    }
    return self.client.post("/_service/export_csv", data=json.dumps(data),
                            headers=headers)
