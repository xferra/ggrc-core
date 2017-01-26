# Copyright (C) 2017 Google Inc.
# Licensed under http://www.apache.org/licenses/LICENSE-2.0 <see LICENSE file>

"""The module contains classes for working with REST api"""

import Cookie
import json
import urlparse

import requests

from lib import environment
from lib.service.rest.template_provider import TemplateProvider
from lib.constants import url
from lib.utils.test_utils import append_random_string


class RestClient(object):
  """Used for HTTP interactions with App's REST API"""
  BASIC_HEADERS = {'X-Requested-By': 'GGRC',
                   'Content-Type': 'application/json',
                   'Accept-Encoding': 'gzip, deflate'}

  def __init__(self, endpoint):
    self.url = urlparse.urljoin(environment.APP_URL,
                                "/".join([url.API, endpoint]))
    self.session = None

  def init_session(self):
    """Return authorization cookie value"""
    response = requests.get(urlparse.urljoin(environment.APP_URL, "/login"))
    cookie = Cookie.SimpleCookie()
    cookie.load(response.headers["Set-Cookie"])
    self.session = cookie["session"].value

  def get_headers(self):
    """Return prepared header for HTTP call"""
    headers = self.BASIC_HEADERS
    if self.session is None:
      self.init_session()
    headers["Cookie"] = "session={0}".format(self.session)
    return headers

  def create_objects(self, obj_type, count=1, title_postfix=None, **kwargs):
    """Send HTTP request for objects creation via REST API"""
    request_body = generate_body_by_template(count=count,
                                             template_name=obj_type,
                                             title_postfix=title_postfix,
                                             **kwargs)
    headers = self.get_headers()
    response = requests.post(url=self.url, data=request_body, headers=headers)
    return response


def generate_body_by_template(count, template_name, title_postfix=None,
                              **kwargs):
  """Generate list of objects based on object type

  Object type can be assessment, control, etc from json templates
  """
  def upgrade_template(template_name, title_postfix=None, **kwargs):
    """Return updated template json with random title by template name"""
    obj_title = append_random_string(template_name)
    if title_postfix is not None:
      obj_title += title_postfix
    return TemplateProvider.get_template_as_dict(
        template_name, title=obj_title, **kwargs)

  objects = [upgrade_template(template_name=template_name,
                              title_postfix=title_postfix,
                              **kwargs) for _ in xrange(count)]
  return json.dumps(objects)
